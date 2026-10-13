<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Note;
use App\Models\Reminder;
use App\Models\Gamification;
use App\Models\BotUser;
use App\Services\GeminiAiService;
use App\Services\FrendWhatsAppService;
use App\Services\ReminderDispatchService;
use Carbon\Carbon;
use Exception;

/**
 * WhatsApp Webhook & Message Ingestion Controller
 * 
 * cPanel শেয়ার্ড হোস্টিংয়ে Node.js না থাকায়:
 * ১. Railway বা অন্য সার্ভারে থাকা WhatsApp গেটওয়ে থেকে ইনকামিং মেসেজ এই ওয়েবহুকে আসবে
 * ২. Laravel এই কন্ট্রোলারে মেসেজটি Gemini AI দিয়ে বিশ্লেষণ করবে
 * ৩. MySQL-এ নোট বা রিমাইন্ডার সংরক্ষণ করবে
 * ৪. WhatsApp-এ স্বয়ংক্রিয় বাংলা রিপ্লাই ফেরত পাঠাবে
 * ৫. cPanel ক্রনজব URL হ্যান্ডলার (GET /cron/reminders/process) পরিচালনা করবে
 */
class WhatsAppWebhookController extends Controller
{
    protected GeminiAiService $ai;
    protected FrendWhatsAppService $whatsapp;
    protected ReminderDispatchService $dispatcher;

    public function __construct(
        GeminiAiService $ai,
        FrendWhatsAppService $whatsapp,
        ReminderDispatchService $dispatcher
    ) {
        $this->ai = $ai;
        $this->whatsapp = $whatsapp;
        $this->dispatcher = $dispatcher;
    }

    /**
     * ইনকামিং WhatsApp বার্তা গ্রহণ ও প্রসেসিং
     */
    public function handleIncomingMessage(Request $request)
    {
        $sender = $request->input('from') ?: $request->input('sender') ?: $request->input('phone');
        $text = trim($request->input('message') ?: $request->input('text') ?: $request->input('body', ''));
        $name = $request->input('name', 'বন্ধু');

        if (empty($sender) || empty($text)) {
            return response()->json(['status' => 'ignored', 'reason' => 'Empty sender or text']);
        }

        // Clean digits
        $cleanPhone = preg_replace('/\D/', '', $sender);

        // কঠোর ইউজার আইসোলেশন ও অথরাইজেশন যাচাই
        $botUser = BotUser::where('bound_phone', $sender)
            ->orWhere('bound_phone', 'LIKE', "%{$cleanPhone}%")
            ->first();

        // যদি ইউজার ব্লক বা নিষ্ক্রিয় থাকে তবে সেবা বন্ধ
        if ($botUser && ($botUser->status === 'blocked' || $botUser->status === 'disabled')) {
            $this->whatsapp->sendMessage($sender, "⚠️ আপনার অ্যাকাউন্টটি সাময়িকভাবে নিষ্ক্রিয় বা ব্লক রয়েছে। প্রশাসকের সাথে যোগাযোগ করুন।");
            return response()->json(['status' => 'rejected', 'reason' => 'User blocked or disabled']);
        }

        $effectiveUserId = $botUser ? $botUser->username : $cleanPhone;

        // 1. কমান্ড ফিল্টারিং
        if (preg_match('/^(মেনু|help|সাহায্য|menu)$/iu', $text)) {
            $reply = "🤖 *FREND Assistant মেনু*\n\n"
                   . "📝 *নোট রাখতে:* `নোট: <আপনার লেখা>`\n"
                   . "📋 *আপনার নোট দেখতে:* `আমার নোট`\n"
                   . "⏰ *রিমাইন্ডার সেট করতে:* `রিমাইন্ডার: কাল সকাল ১০টায় মিটিং`\n"
                   . "🔔 *আপনার রিমাইন্ডার দেখতে:* `আমার রিমাইন্ডার`\n"
                   . "🏆 *পয়েন্ট দেখতে:* `পয়েন্ট` বা `লেভেল`\n\n"
                   . "🔒 _আপনার ডেটা সম্পূর্ণ ব্যক্তিগত এবং অন্য কারো কাছে যাবে না।_";
            $this->whatsapp->sendMessage($sender, $reply);
            return response()->json(['status' => 'handled', 'command' => 'menu']);
        }

        // ইউজার-স্পেসিফিক নোট তালিকা (শুধুমাত্র এই ইউজারের নিজস্ব নোট ফেরত দেবে)
        if (preg_match('/^(?:আমার\s*নোট|নোট\s*(?:লিস্ট|দেখাও|দেখ)|my\s*notes|notes)$/iu', $text)) {
            $userNotes = Note::where(function($q) use ($effectiveUserId, $cleanPhone, $sender) {
                $q->where('user_id', $effectiveUserId)
                  ->orWhere('user_id', $cleanPhone)
                  ->orWhere('user_id', $sender);
            })->latest()->take(10)->get();

            if ($userNotes->isEmpty()) {
                $reply = "📝 আপনার কোনো ব্যক্তিগত সংরক্ষিত নোট পাওয়া যায়নি।\nনতুন নোট রাখতে লিখুন:\n`নোট: <আপনার লেখা>`";
            } else {
                $reply = "📝 *আপনার ব্যক্তিগত নোটসমূহ (" . $userNotes->count() . "টি):*\n\n";
                foreach ($userNotes as $idx => $n) {
                    $reply .= ($idx + 1) . ". {$n->content} _(#{$n->id})_\n";
                }
                $reply .= "\n_🔒 এই নোটগুলো শুধুমাত্র আপনি দেখতে পাচ্ছেন।_";
            }
            $this->whatsapp->sendMessage($sender, $reply);
            return response()->json(['status' => 'handled', 'command' => 'my_notes']);
        }

        // ইউজার-স্পেসিফিক রিমাইন্ডার তালিকা (শুধুমাত্র এই ইউজারের নিজস্ব রিমাইন্ডার ফেরত দেবে)
        if (preg_match('/^(?:আমার\s*রিমাইন্ডার|রিমাইন্ডার\s*(?:লিস্ট|দেখাও|দেখ)|my\s*reminders|reminders)$/iu', $text)) {
            $userReminders = Reminder::where(function($q) use ($effectiveUserId, $cleanPhone, $sender) {
                $q->where('user_id', $effectiveUserId)
                  ->orWhere('user_id', $cleanPhone)
                  ->orWhere('user_id', $sender);
            })->where('is_sent', false)
              ->whereIn('status', ['PENDING', 'PROCESSING', 'RETRYING'])
              ->orderBy('remind_at', 'asc')
              ->take(10)->get();

            if ($userReminders->isEmpty()) {
                $reply = "⏰ আপনার কোনো অপেক্ষমান রিমাইন্ডার নেই।\nনতুন রিমাইন্ডার সেট করতে লিখুন:\n`রিমাইন্ডার: কাল সকাল ১০টায় মিটিং`";
            } else {
                $reply = "⏰ *আপনার অপেক্ষমান রিমাইন্ডারসমূহ (" . $userReminders->count() . "টি):*\n\n";
                foreach ($userReminders as $idx => $r) {
                    $reply .= ($idx + 1) . ". *{$r->content}*\n   🕒 " . $r->remind_at->format('d M, h:i A') . "\n";
                }
                $reply .= "\n_🔒 এই রিমাইন্ডারগুলো শুধুমাত্র আপনার WhatsApp-এ পাঠানো হবে।_";
            }
            $this->whatsapp->sendMessage($sender, $reply);
            return response()->json(['status' => 'handled', 'command' => 'my_reminders']);
        }

        if (preg_match('/^(পয়েন্ট|পয়েন্ট|level|লেভেল|xp|points)$/iu', $text)) {
            $gamify = Gamification::firstOrCreate(['user_id' => $cleanPhone]);
            $reply = "🏆 *আপনার গ্যামিফিকেশন প্রোফাইল*\n\n"
                   . "⭐ লেভেল: {$gamify->level}\n"
                   . "✨ মোট XP পয়েন্ট: {$gamify->points}\n"
                   . "🔥 স্ট্রিক: {$gamify->streak_days} দিন\n"
                   . "✅ সম্পন্ন কাজ: {$gamify->tasks_completed}টি\n\n"
                   . "_প্রতিটি কাজের সাথে সাথে আপনার পয়েন্ট বাড়ে!_";
            $this->whatsapp->sendMessage($sender, $reply);
            return response()->json(['status' => 'handled', 'command' => 'gamification']);
        }

        // 2. সরাসরি নোট কমান্ড (ব্যবহারকারীর অ্যাকাউন্টে সীমাবদ্ধ)
        if (preg_match('/^(?:নোট|note)[:\s]+(.+)$/ius', $text, $matches)) {
            $noteContent = trim($matches[1]);
            Note::create([
                'user_id' => $effectiveUserId,
                'content' => $noteContent,
                'tags' => 'whatsapp',
            ]);

            $reply = "📝 *নোট মনে রেখেছি!*\n\n\"{$noteContent}\"\n\n_🔒 এটি শুধুমাত্র আপনার অ্যাকাউন্টে সংরক্ষিত হলো।_";
            $this->whatsapp->sendMessage($sender, $reply);
            return response()->json(['status' => 'handled', 'command' => 'note']);
        }

        // 3. স্মার্ট AI এনালাইজার (Gemini)
        $analysis = $this->ai->analyzeMessageForReminder($text);

        if (!empty($analysis['hasEvent']) && !empty($analysis['eventText'])) {
            $eventText = $analysis['eventText'];
            $timeHint = $analysis['timeHint'] ?? 'পরে';
            $minutes = $analysis['estimatedMinutesFromNow'] ?? 60;
            $remindAt = Carbon::now('Asia/Dhaka')->addMinutes($minutes);

            Reminder::create([
                'user_id' => $effectiveUserId,
                'content' => $eventText,
                'remind_at' => $remindAt,
                'status' => 'PENDING',
                'is_sent' => false,
            ]);

            $reply = "⏰ *স্মার্ট রিমাইন্ডার সেট করা হয়েছে!*\n\n"
                   . "📌 কাজ: *{$eventText}*\n"
                   . "🕒 সময়: *{$timeHint}* (" . $remindAt->format('d M, h:i A') . ")\n\n"
                   . "নির্দিষ্ট সময়ে আমি আপনাকে আবার মনে করিয়ে দেব ইনশাআল্লাহ!";
            $this->whatsapp->sendMessage($sender, $reply);
            return response()->json(['status' => 'handled', 'type' => 'ai_reminder']);
        }

        // 4. সাধারণ বুদ্ধিমান বাংলা উত্তর (Gemini Chat)
        $chatReply = $this->ai->chatReply($text, $name);
        $this->whatsapp->sendMessage($sender, $chatReply);

        return response()->json(['status' => 'handled', 'type' => 'chat']);
    }

    /**
     * cPanel ক্রনজব URL হ্যান্ডলার (Terminal ছাড়া শুধু URL হিট করলেই রিমাইন্ডার পাঠাবে)
     * URL: GET /cron/reminders/process?secret=your-cpanel-key
     */
    public function cpanelCronTrigger(Request $request)
    {
        $res = $this->dispatcher->dispatchDueReminders();
        return response()->json([
            'status' => 'success',
            'message' => 'cPanel Cron Job Executed Successfully',
            'data' => $res,
        ]);
    }
}
