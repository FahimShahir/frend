<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Note;
use App\Models\Reminder;
use App\Models\Gamification;
use App\Models\BotUser;
use App\Models\Setting;
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
use App\Services\AggressiveLocalAiService;
use App\Services\SelfHealingService;
use App\Services\SelfUpdateService;
use App\Services\HumanEmotionalCompanionService;
use App\Services\FriendshipMediationService;

class WhatsAppWebhookController extends Controller
{
    protected AggressiveLocalAiService $localAi;
    protected SelfHealingService $healer;
    protected SelfUpdateService $updater;
    protected FrendWhatsAppService $whatsapp;
    protected ReminderDispatchService $dispatcher;
    protected HumanEmotionalCompanionService $companion;
    protected FriendshipMediationService $mediation;

    public function __construct(
        AggressiveLocalAiService $localAi,
        SelfHealingService $healer,
        SelfUpdateService $updater,
        FrendWhatsAppService $whatsapp,
        ReminderDispatchService $dispatcher,
        HumanEmotionalCompanionService $companion,
        FriendshipMediationService $mediation
    ) {
        $this->localAi = $localAi;
        $this->healer = $healer;
        $this->updater = $updater;
        $this->whatsapp = $whatsapp;
        $this->dispatcher = $dispatcher;
        $this->companion = $companion;
        $this->mediation = $mediation;
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

        $groupId = $request->input('group_id') ?: $request->input('chat_id');
        if (!$groupId && str_ends_with($sender, '@g.us')) {
            $groupId = $sender;
        }

        // ০. ফ্রেন্ডশিপ কনফ্লিক্ট ও মধ্যস্থতা ইঞ্জিন (AI Friendship Conflict Resolution & Reconciliation)
        $mediationRes = $this->mediation->handleMediationMessage($sender, $name, $text, $groupId);
        if ($mediationRes && !empty($mediationRes['handled'])) {
            $isDirectCaller = $request->input('check_only') === 'mediation';
            if (!empty($mediationRes['reply']) && !$isDirectCaller) {
                $targetJid = $groupId ?: $sender;
                $this->whatsapp->sendMessage($targetJid, $mediationRes['reply']);
            }
            return response()->json([
                'status' => 'handled',
                'type' => 'friendship_mediation',
                'step' => $mediationRes['step'] ?? null,
                'case_code' => $mediationRes['case_code'] ?? null,
                'reply' => $mediationRes['reply'] ?? null,
            ]);
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

        $adminPhone = Setting::get('OWNER_PHONE') ?? Setting::get('ADMIN_WHATSAPP_PHONE');
        $isAdmin = ($botUser && ($botUser->role === 'admin' || $botUser->is_admin)) 
            || (!empty($adminPhone) && ($sender === $adminPhone || $cleanPhone === $adminPhone));

        // ৩. সেলফ-হিলিং কমান্ড (সিস্টেম অখণ্ডতা পরীক্ষা ও স্বয়ংক্রিয় মেরামত)
        if (preg_match('/^(?:সেলফ\s*হিলিং|self\s*heal(?:ing)?|সিস্টেম\s*চেক|system\s*check|স্বাস্থ্য\s*পরীক্ষা)$/iu', $text)) {
            $healReport = $this->healer->diagnoseAndHeal();
            $statusText = $healReport['healthy'] ? '✅ সুস্থ ও সক্রিয় (Healthy)' : '⚠️ রিকভারি সম্পন্ন হয়েছে';
            $reply = "🩺 *FREND স্বয়ংক্রিয় সেলফ-হিলিং রিপোর্ট*\n\n"
                   . "• অবস্থা: {$statusText}\n"
                   . "• ডেটাবেস: " . ($healReport['diagnostics']['database'] ?? 'OK') . "\n"
                   . "• উদ্ধারকৃত রিমাইন্ডার: " . ($healReport['diagnostics']['stuck_reminders_recovered'] ?? 0) . "টি\n"
                   . "• সিস্টেম ক্যাশ: পরিষ্কার করা হয়েছে ✅\n";
            if (!empty($healReport['healed_actions'])) {
                $reply .= "\n🔧 *হিলিং অ্যাকশন:*\n" . implode("\n", array_map(fn($a) => "- {$a}", $healReport['healed_actions']));
            }
            $reply .= "\n\n_🛡️ সিস্টেম সেলফ-হিলিং স্বয়ংক্রিয়ভাবে সার্বক্ষণিক নজরদারি করছে।_";
            $this->whatsapp->sendMessage($sender, $reply);
            return response()->json(['status' => 'handled', 'command' => 'self_heal', 'report' => $healReport]);
        }

        // ৪. স্বয়ংক্রিয় সেলফ-আপডেট কমান্ড (অ্যাডমিন অনুমোদিত)
        if (preg_match('/^(?:বট\s*আপডেট|self\s*update|আপডেট\s*করো|সিস্টেম\s*আপডেট)$/iu', $text)) {
            if (!$isAdmin) {
                $this->whatsapp->sendMessage($sender, "⚠️ দুঃখিত, সেলফ-আপডেট নির্দেশ দেওয়ার অনুমতি শুধুমাত্র প্রশাসকের রয়েছে।");
                return response()->json(['status' => 'unauthorized', 'command' => 'self_update']);
            }
            $updateRes = $this->updater->executeSelfUpdate('v2.6.0', 'WhatsApp কমান্ডের মাধ্যমে সেলফ-আপডেট', 'whatsapp');
            if ($updateRes['success']) {
                $reply = "🚀 *FREND স্বয়ংক্রিয় সেলফ-আপডেট সম্পন্ন!*\n\n"
                       . "• ভার্সন: {$updateRes['version']}\n"
                       . "• স্কিমা ও মাইগ্রেশন: সিঙ্কড ✅\n"
                       . "• অপটিমাইজেশন ও ক্যাশ: রিফ্রেশ সম্পন্ন ✅\n"
                       . "• অফলাইন মডেল ও রুলস: সক্রিয় ✅\n\n"
                       . "_কোনো টার্মিনাল ছাড়াই সফলভাবে সিস্টেম আপডেট হয়েছে।_";
            } else {
                $reply = "❌ *আপডেট ত্রুটি:* " . ($updateRes['error'] ?? 'অজানা ত্রুটি');
            }
            $this->whatsapp->sendMessage($sender, $reply);
            return response()->json(['status' => 'handled', 'command' => 'self_update', 'result' => $updateRes]);
        }

        // ৫. ইনস্ট্যান্ট নতুন ফিচার যোগ (অ্যাডমিন কমান্ড: নতুন ফিচার: <কিওয়ার্ড> => <উত্তর>)
        if (preg_match('/^(?:নতুন\s*ফিচার|add\s*feature)[:\s]+(.+)$/ius', $text, $matches)) {
            if (!$isAdmin) {
                $this->whatsapp->sendMessage($sender, "⚠️ নতুন ফিচার যোগ করার অনুমতি শুধুমাত্র প্রশাসকের রয়েছে।");
                return response()->json(['status' => 'unauthorized']);
            }
            $featureInput = trim($matches[1]);
            $parts = preg_split('/=>|->|:/u', $featureInput, 2);
            if (count($parts) === 2) {
                $kw = trim($parts[0]);
                $tpl = trim($parts[1]);
                $this->localAi->registerDynamicFeature("ফিচার: {$kw}", $kw, $tpl);
                $reply = "✨ *নতুন ডাইনামিক ফিচার যোগ করা হয়েছে!*\n\n"
                       . "📌 কিওয়ার্ড: *{$kw}*\n"
                       . "💬 স্বয়ংক্রিয় উত্তর: *{$tpl}*\n\n"
                       . "এখন থেকে যে কেউ `{$kw}` লিখলে অফলাইনে এই উত্তরটি পাবে (০ API খরচ)!";
                $this->whatsapp->sendMessage($sender, $reply);
                return response()->json(['status' => 'handled', 'command' => 'dynamic_feature_added']);
            }
        }

        // ৬. অন্যকে মেসেজ পাঠানো বা বিরোধ মীমাংসা/মধ্যস্থতা (Mediation & Peacemaking)
        $companionAction = $this->companion->handleEmotionalInteraction($text, $name, $effectiveUserId);
        if (isset($companionAction['type']) && in_array($companionAction['type'], ['outgoing_message', 'need_phone', 'mediation_active', 'need_mediation_phone'])) {
            $this->whatsapp->sendMessage($sender, $companionAction['reply']);
            return response()->json(['status' => 'handled', 'type' => in_array($companionAction['type'], ['mediation_active', 'need_mediation_phone']) ? 'friendship_mediation' : $companionAction['type']]);
        }

        // যদি whatsapp_bot_runner শুধুমাত্র মিডিয়েশন বা আউটগোয়িং মেসেজ যাচাইয়ের জন্য পাঠিয়ে থাকে
        if ($request->input('check_only') === 'mediation') {
            return response()->json(['status' => 'not_handled', 'reason' => 'normal_chat_for_runner']);
        }

        // ৭. অ্যাগ্রেসিভ লোকাল অফলাইন AI ইঞ্জিন (রিমাইন্ডার ও দ্রুত অফলাইন রুলস)
        $aiResult = $this->localAi->processMessage($text, $name, $effectiveUserId);

        // যদি কোনো রিমাইন্ডার শনাক্ত হয় (অফলাইন রুলস বা ফলব্যাক দিয়ে)
        if (!empty($aiResult['reminder_data']['hasEvent'])) {
            $rData = $aiResult['reminder_data'];
            $eventText = $rData['eventText'];
            $timeHint = $rData['timeHint'] ?? 'পরে';
            $remindAt = $rData['remindAt'] ?? Carbon::now('Asia/Dhaka')->addHour();

            Reminder::create([
                'user_id' => $effectiveUserId,
                'content' => $eventText,
                'remind_at' => $remindAt,
                'status' => 'PENDING',
                'is_sent' => false,
            ]);

            $sourceLabel = ($aiResult['handled_locally'] ?? false) ? '⚡ লোকাল অফলাইন AI' : '🧠 ক্লাউড AI';
            $reply = "⏰ *স্মার্ট রিমাইন্ডার সেট করা হয়েছে!* ({$sourceLabel})\n\n"
                   . "📌 কাজ: *{$eventText}*\n"
                   . "🕒 সময়: *{$timeHint}* (" . $remindAt->format('d M, h:i A') . ")\n\n"
                   . "নির্দিষ্ট সময়ে আমি আপনাকে আবার মনে করিয়ে দেব ইনশাআল্লাহ! 🚀\n"
                   . "_🔒 এটি শুধুমাত্র আপনার অ্যাকাউন্টে সংরক্ষিত।_";
            $this->whatsapp->sendMessage($sender, $reply);
            return response()->json(['status' => 'handled', 'type' => 'reminder', 'source' => $aiResult['source'] ?? 'local']);
        }

        // যদি লোকাল প্যাটার্ন বা ডাইনামিক ফিচার সরাসরি হ্যান্ডেল করে (শুধুমাত্র ইউটিলিটি/ক্যালকুলেশন বা লাইভ API না থাকলে)
        $hasLiveApiKey = !empty(Setting::get('GEMINI_API_KEY') ?: (function_exists('env') ? \env('GEMINI_API_KEY') : null));
        $isDeterministicUtility = preg_match('/^\s*(\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(\d+(?:\.\d+)?)/iu', $text)
            || preg_match('/(?:সেলফ\s*হিলিং|self\s*heal|system\s*check)/iu', $text)
            || ($aiResult['source'] ?? '') === 'dynamic_feature';

        if (!empty($aiResult['handled_locally']) && !empty($aiResult['reply']) && ($aiResult['source'] ?? '') !== 'local_cache' && (!$hasLiveApiKey || $isDeterministicUtility)) {
            $this->whatsapp->sendMessage($sender, $aiResult['reply']);
            return response()->json([
                'status' => 'handled',
                'type' => 'chat',
                'handled_locally' => true,
                'source' => $aiResult['source'] ?? 'local'
            ]);
        }

        // ৮. জীবন্ত মানবিক ইমোশনাল কম্প্যানিয়ন (রোমান্টিকতা, মান-অভিমান, ক্ষমা চাওয়া, অতীত ডেটা দিয়ে আইডিয়া ও বুদ্ধি)
        $chatReply = $companionAction['reply'] ?? ($aiResult['reply'] ?? 'আমি তোমার সাথেই আছি!');
        $this->whatsapp->sendMessage($sender, $chatReply);

        return response()->json([
            'status' => 'handled', 
            'type' => 'emotional_companion', 
            'emotion' => $companionAction['emotion'] ?? 'caring',
            'bond_level' => $companionAction['bond_level'] ?? 30,
        ]);
    }

    /**
     * WhatsApp গ্রুপ মেম্বার লিভ ইভেন্ট হ্যান্ডলার (Step 7 & Step 9 Mediation)
     */
    public function handleGroupMemberLeft(Request $request)
    {
        $groupId = $request->input('group_id') ?: $request->input('chat_id');
        $leaverPhone = $request->input('leaver_phone') ?: $request->input('sender') ?: $request->input('user');

        if (empty($groupId) || empty($leaverPhone)) {
            return response()->json(['status' => 'error', 'message' => 'group_id and leaver_phone required'], 400);
        }

        $result = $this->mediation->handleGroupMemberLeftEvent($groupId, $leaverPhone);

        return response()->json([
            'status' => 'success',
            'data' => $result,
        ]);
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
