<?php

namespace App\Services;

use App\Models\Reminder;
use App\Models\Gamification;
use App\Services\FrendWhatsAppService;
use Exception;

/**
 * Reminder Dispatch Service
 * 
 * cPanel শেয়ার্ড হোস্টিংয়ের জন্য রিমাইন্ডার ডিসপ্যাচার।
 * এটি MySQL থেকে ডিউ (Due) রিমাইন্ডার খুঁজে নিয়ে সরাসরি WhatsApp-এ বার্তা পাঠায়
 * এবং ব্যবহারকারীকে গ্যামিফিকেশন পয়েন্ট প্রদান করে।
 */
class ReminderDispatchService
{
    protected FrendWhatsAppService $whatsapp;

    public function __construct(FrendWhatsAppService $whatsapp)
    {
        $this->whatsapp = $whatsapp;
    }

    /**
     * সকল পেন্ডিং ও ডিউ রিমাইন্ডার প্রসেস করা
     * @return array [processed, success, failed, details]
     */
    public function dispatchDueReminders(): array
    {
        $dueReminders = Reminder::due()->get();
        $processed = 0;
        $success = 0;
        $failed = 0;
        $details = [];

        foreach ($dueReminders as $reminder) {
            $processed++;
            $rawUserId = $reminder->user_id;

            // কঠোর ইউজার আইসোলেশন: শুধুমাত্র এই ইউজারের নিজস্ব WhatsApp নম্বরেই পাঠানো হবে
            $targetPhone = null;
            if (!empty($rawUserId)) {
                $botUser = \App\Models\BotUser::where('username', $rawUserId)
                    ->orWhere('id', $rawUserId)
                    ->orWhere('bound_phone', $rawUserId)
                    ->first();

                if ($botUser && !empty($botUser->bound_phone)) {
                    $targetPhone = $botUser->bound_phone;
                } else {
                    $digits = preg_replace('/\D/', '', (string)$rawUserId);
                    if (strlen($digits) >= 10) {
                        $targetPhone = $rawUserId;
                    }
                }
            }

            // সিকিউরিটি গার্ড: ইউজারের ফোন না থাকলে অন্য কারো কাছে কোনোভাবেই পাঠানো হবে না
            if (empty($targetPhone)) {
                $reminder->markFailed('ইউজার ' . $rawUserId . '-এর কোনো বৈধ WhatsApp নম্বর পাওয়া যায়নি (অন্য ইউজারের কাছে মেসেজ যাওয়া প্রতিরোধ করা হলো)');
                $failed++;
                $details[] = [
                    'id' => $reminder->id,
                    'user_id' => $rawUserId,
                    'status' => 'FAILED',
                    'error' => 'Unmapped recipient phone for user',
                ];
                continue;
            }

            // Format friendly Bengali reminder
            $message = "⏰ *ব্যক্তিগত রিমাইন্ডার!*\n\n"
                     . "📌 মনে রাখুন: *{$reminder->content}*\n\n"
                     . "✅ কাজটি শেষ হলে রিপ্লাই দিন: `সম্পন্ন`\n"
                     . "💤 ১৫ মিনিট পর মনে করাতে রিপ্লাই দিন: `স্নুজ`";

            try {
                $sendResult = $this->whatsapp->sendMessage($targetPhone, $message);

                if ($sendResult['success']) {
                    $reminder->markSent();
                    $success++;

                    // Award gamification points strictly to this user
                    try {
                        $gamify = Gamification::firstOrCreate(['user_id' => $targetPhone]);
                        $gamify->recordTaskCompletion();
                    } catch (Exception $ge) {}

                    $details[] = [
                        'id' => $reminder->id,
                        'phone' => $targetPhone,
                        'user_id' => $rawUserId,
                        'status' => 'SENT',
                    ];
                } else {
                    $reminder->markFailed($sendResult['error'] ?? 'WhatsApp প্রেরণে ব্যর্থ');
                    $failed++;
                    $details[] = [
                        'id' => $reminder->id,
                        'phone' => $targetPhone,
                        'user_id' => $rawUserId,
                        'status' => 'FAILED',
                        'error' => $sendResult['error'] ?? 'অজানা ত্রুটি',
                    ];
                }
            } catch (Exception $e) {
                $reminder->markFailed($e->getMessage());
                $failed++;
                $details[] = [
                    'id' => $reminder->id,
                    'phone' => $targetPhone,
                    'user_id' => $rawUserId,
                    'status' => 'ERROR',
                    'error' => $e->getMessage(),
                ];
            }
        }

        return [
            'total_found' => count($dueReminders),
            'processed' => $processed,
            'success' => $success,
            'failed' => $failed,
            'timestamp' => now()->toIso8601String(),
            'details' => $details,
        ];
    }
}
