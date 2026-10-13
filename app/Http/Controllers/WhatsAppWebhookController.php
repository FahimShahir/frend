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

        // 1. কমান্ড ফিল্টারিং
        if (preg_match('/^(মেনু|help|সাহায্য|menu)$/iu', $text)) {
            $reply = "🤖 *FREND Assistant মেনু*\n\n"
                   . "📝 *নোট রাখতে:* `নোট: <আপনার লেখা>`\n"
                   . "⏰ *রিমাইন্ডার সেট করতে:* `রিমাইন্ডার: কাল সকাল ১০টায় মিটিং`\n"
                   . "🏆 *পয়েন্ট দেখতে:* `পয়েন্ট` বা `লেভেল`\n"
                   . "📋 *নোট দেখতে:* `আমার নোট`\n"
                   . "💡 আপনি সাধারণ বাংলায় যেকোনো কথা লিখলেও আমি বুঝে নেব!";
            $this->whatsapp->sendMessage($sender, $reply);
            return response()->json(['status' => 'handled', 'command' => 'menu']);
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

        // 2. সরাসরি নোট কমান্ড
        if (preg_match('/^(?:নোট|note)[:\s]+(.+)$/ius', $text, $matches)) {
            $noteContent = trim($matches[1]);
            Note::create([
                'user_id' => $cleanPhone,
                'content' => $noteContent,
                'tags' => 'whatsapp',
            ]);

            $reply = "📝 *নোট মনে রেখেছি!*\n\n\"{$noteContent}\"\n\n_পরবর্তীতে যেকোনো সময় ড্যাশবোর্ডে দেখতে পাবেন।_";
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
                'user_id' => $cleanPhone,
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
