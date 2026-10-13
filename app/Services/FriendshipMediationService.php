<?php

namespace App\Services;

use App\Models\FriendshipMediation;
use App\Models\FriendshipMediationLog;
use Illuminate\Support\Facades\Http;
use Carbon\Carbon;
use Exception;

/**
 * AI Friendship Conflict Resolution & Reconciliation System
 * 
 * একজন নিরপেক্ষ, সহানুভূতিশীল ও বিশ্বস্ত মধ্যস্থতাকারী (Mediator) হিসেবে
 * ৯টি সুনির্দিষ্ট ধাপে দুইজন বন্ধুর মধ্যকার ঝগড়া ও ভুল বোঝাবুঝি দূর করার প্রযুক্তিগত ইঞ্জিন।
 */
class FriendshipMediationService
{
    protected GeminiAiService $gemini;
    protected FrendWhatsAppService $whatsapp;

    public function __construct(GeminiAiService $gemini, FrendWhatsAppService $whatsapp)
    {
        $this->gemini = $gemini;
        $this->whatsapp = $whatsapp;
    }

    /**
     * ফোন নম্বর নিখুঁতভাবে মেলানো (শেষ ৯ ডিজিট সাফিক্স তুলনা)
     */
    public function isPhoneMatch(string $phone1, ?string $phone2): bool
    {
        if (empty($phone2)) {
            return false;
        }
        $c1 = preg_replace('/\D/', '', $phone1);
        $c2 = preg_replace('/\D/', '', $phone2);
        if ($c1 === $c2 && !empty($c1)) {
            return true;
        }
        $t1 = strlen($c1) >= 9 ? substr($c1, -9) : $c1;
        $t2 = strlen($c2) >= 9 ? substr($c2, -9) : $c2;
        return (!empty($t1) && $t1 === $t2);
    }

    /**
     * প্রেরকের ভূমিকা (Role) নির্ভুলভাবে নির্ধারণ
     */
    public function getParticipantRole(FriendshipMediation $med, string $senderPhone): ?string
    {
        if ($this->isPhoneMatch($senderPhone, $med->party_a_phone) || $this->isPhoneMatch($senderPhone, $med->party_a_id)) {
            return 'party_a';
        }
        if ($this->isPhoneMatch($senderPhone, $med->party_b_phone)) {
            return 'party_b';
        }
        if ($this->isPhoneMatch($senderPhone, $med->initiator_phone)) {
            return 'initiator';
        }
        return null;
    }

    /**
     * কথোপকথনের ধারাবাহিক স্মৃতি সংযোজন (কখনোই আগের বক্তব্য মোছা যাবে না)
     */
    public function appendStatement(FriendshipMediation $med, string $role, string $text, string $senderName): void
    {
        $timestamp = now()->setTimezone('Asia/Dhaka')->format('h:i A, d M');
        $speaker = ($role === 'party_a') ? ($med->party_a_name ?: 'বন্ধু ১') : ($med->party_b_name ?: 'বন্ধু ২');
        $entry = "[{$timestamp}] {$speaker}: {$text}";

        if ($role === 'party_a') {
            if (empty($med->party_a_statement)) {
                $med->party_a_statement = $entry;
            } else {
                $med->party_a_statement .= "\n" . $entry;
            }
        } elseif ($role === 'party_b') {
            if (empty($med->party_b_statement)) {
                $med->party_b_statement = $entry;
            } else {
                $med->party_b_statement .= "\n" . $entry;
            }
        }
        $med->save();
    }

    /**
     * নির্দিষ্ট পক্ষের সাম্প্রতিক কথোপকথনের ইতিহাস উদ্ধার (AI Context-এর জন্য)
     */
    public function getPartyConversationHistory(FriendshipMediation $med, string $role): array
    {
        try {
            $logs = FriendshipMediationLog::where('mediation_id', $med->id)
                ->whereIn('sender_role', [$role, 'ai_mediator'])
                ->orderBy('id', 'asc')
                ->take(20)
                ->get();

            $history = [];
            foreach ($logs as $log) {
                $history[] = [
                    'sender' => ($log->sender_role === 'ai_mediator') ? 'মিডিয়েটর' : (($role === 'party_a') ? ($med->party_a_name ?: 'বন্ধু ১') : ($med->party_b_name ?: 'বন্ধু ২')),
                    'text' => $log->message_body,
                ];
            }
            return $history;
        } catch (Exception $e) {
            return [];
        }
    }

    /**
     * ইনকামিং মেসেজ কোনো মধ্যস্থতা কেসের অংশ কিনা যাচাই করে হ্যান্ডেল করা
     */
    public function handleMediationMessage(string $senderPhone, string $senderName, string $text, ?string $groupId = null): ?array
    {
        $cleanPhone = preg_replace('/\D/', '', $senderPhone);

        // ১. গ্রুপ মেসেজ হ্যান্ডলিং (যদি মেসেজটি কোনো সক্রিয় মেডিয়েশন গ্রুপের হয়)
        if ($groupId && str_ends_with($groupId, '@g.us')) {
            $groupMediation = FriendshipMediation::where('group_id', $groupId)
                ->where('is_terminated', false)
                ->first();

            if ($groupMediation) {
                return $this->processGroupMessage($groupMediation, $senderPhone, $senderName, $text);
            }
        }

        // ২. ব্যক্তিগত মেসেজ হ্যান্ডলিং (Party A অথবা Party B এর চলমান কেস)
        $activeMediation = FriendshipMediation::findActiveMediationFor($senderPhone);

        if ($activeMediation) {
            $role = $this->getParticipantRole($activeMediation, $senderPhone);

            if ($role === 'party_a') {
                return $this->processPartyAMessage($activeMediation, $senderPhone, $senderName, $text);
            } elseif ($role === 'party_b') {
                return $this->processPartyBMessage($activeMediation, $senderPhone, $senderName, $text);
            }
        }

        // ২.১. ইনশিয়েটর (Admin / Initiator) স্ট্যাটাস চেক — যদি কোনো তৃতীয় ব্যক্তি/অ্যাডমিন চলমান মধ্যস্থতার খবর জানতে চান
        if (strlen($cleanPhone) >= 9 || !empty($senderPhone)) {
            $initiatorCase = FriendshipMediation::where('is_terminated', false)
                ->where(function ($q) use ($cleanPhone, $senderPhone) {
                    $q->where('initiator_phone', $senderPhone);
                    if (strlen($cleanPhone) >= 9) {
                        $q->orWhere('initiator_phone', 'LIKE', "%{$cleanPhone}%");
                    }
                })
                ->latest()
                ->first();

            if ($initiatorCase) {
                if (preg_match('/(?:স্ট্যাটাস|আপডেট|খবর|status|update|progress|কী\s*হলো|কি\s*হলো|ওদের\s*কী|ওদের\s*কি)/iu', $text)) {
                    $f1Status = !empty($initiatorCase->party_a_statement) ? "বক্তব্য পাওয়া গেছে ✅" : "উত্তরের অপেক্ষায় ⏳";
                    $f2Status = !empty($initiatorCase->party_b_statement) ? "বক্তব্য পাওয়া গেছে ✅" : "উত্তরের অপেক্ষায় ⏳";
                    $reply = "📊 *চলমান মধ্যস্থতা স্ট্যাটাস [{$initiatorCase->case_code}]:*\n\n"
                           . "• বন্ধু ১ (" . $this->formatDisplayPhone($initiatorCase->party_a_phone) . "): {$f1Status}\n"
                           . "• বন্ধু ২ (" . $this->formatDisplayPhone($initiatorCase->party_b_phone) . "): {$f2Status}\n"
                           . "• বর্তমান পর্যায়: *" . $this->getHumanStageName($initiatorCase->status) . "*\n\n"
                           . "উভয় পক্ষের সাথে প্রক্রিয়াটি শান্তিপূর্ণভাবে চলমান রয়েছে। 🕊️";
                    return [
                        'handled' => true,
                        'reply' => $reply,
                        'step' => $initiatorCase->status,
                        'case_code' => $initiatorCase->case_code,
                    ];
                }
            }
        }

        // ৩. পূর্বে বন্ধ হওয়া কেসের পর স্বতঃস্ফূর্তভাবে পুনরায় সক্রিয় করার ইচ্ছা শনাক্তকরণ (Reactivation Flow)
        $previousTerminated = FriendshipMediation::findLatestTerminatedMediationFor($senderPhone);

        if ($previousTerminated && $this->isReactivationIntent($text)) {
            return $this->reactivateMediation($senderPhone, $senderName, $text, $previousTerminated);
        }

        // ৪. নতুন মধ্যস্থতা শুরু করার ইচ্ছা শনাক্তকরণ (Initiator starting conflict resolution)
        if ($this->isFriendshipConflictIntent($text)) {
            return $this->routeNewConflictMediation($senderPhone, $senderName, $text);
        }

        return null;
    }

    /**
     * বিরোধ মীমাংসা মেসেজ বিশ্লেষণ করে দুই বন্ধু নাকি একক ব্যক্তির কেস তা নির্ধারণ
     */
    public function routeNewConflictMediation(string $senderPhone, string $senderName, string $text): array
    {
        $phones = $this->extractAllPhoneNumbers($text);

        // প্রেরকের নিজের নম্বরকে সম্ভাব্য দুই বন্ধুর তালিকা থেকে বাদ দেওয়া (যাতে নিজেকে নিজে মেসেজ না পাঠায়)
        $cleanSender = preg_replace('/\D/', '', $senderPhone);
        $externalPhones = array_values(array_filter($phones, function ($p) use ($cleanSender) {
            $cP = preg_replace('/\D/', '', $p);
            return strlen($cleanSender) < 9 || !str_contains($cleanSender, $cP);
        }));

        $isDualFriendExplicit = (bool) preg_match('/(?:২\s*জন|দুই\s*(?:জন)?|২|দুজন)\s*(?:বন্ধু|ফ্রেন্ড|দোস্ত|মানুষ)|(?:ওদের|তাদের)\s*(?:মধ্যে|দুজনের|দুইজনের|২\s*জনের)|(?:ওদের|তাদের)\s*(?:মিল|কথা)|(?:দুই\s*বন্ধুর|২\s*বন্ধুর)/iu', $text);

        // ১. যদি মেসেজে ২টি বা ততোধিক ফোন নম্বর থাকে — সরাসরি দুই বন্ধুর মধ্যস্থতা শুরু
        if (count($externalPhones) >= 2) {
            return $this->initiateDualFriendMediation($senderPhone, $senderName, $externalPhones[0], $externalPhones[1], $text);
        }

        // ২. যদি ২ জন বন্ধুর কথা বলা হয়েছে কিন্তু ২টি নম্বর দেওয়া হয়নি
        if ($isDualFriendExplicit) {
            return [
                'handled' => true,
                'reply' => "🤝 *দুই বন্ধুর মধ্যস্থতা শুরু করতে উভয়ের WhatsApp নম্বর প্রয়োজন:*\n\n"
                         . "অনুগ্রহ করে দুইজন বন্ধুর নম্বর দিন (যেমন:\n"
                         . "`017xxxxxxxx এবং 018xxxxxxxx এর মধ্যে ঝামেলা মিটিয়ে দাও`)\n\n"
                         . "আমি কোনো পক্ষপাত ছাড়া নিরপেক্ষভাবে তাদের দুজনের সাথেই আলাদা আলাদা যোগাযোগ করে কথা শুনব। 🕊️",
                'step' => 'NEED_DUAL_FRIEND_NUMBERS',
            ];
        }

        // ৩. যদি প্রেরক অ্যাডমিন বা বট নিজেই হয় (যেমন self-chat বা বট ওনার) এবং ১টি বা ০টি নম্বর থাকে
        $isAdminSender = (bool) preg_match('/(?:admin|bot|118932660842648|8801969091751|8801601969081)/i', $senderPhone);
        if ($isAdminSender) {
            if (count($externalPhones) >= 2) {
                return $this->initiateDualFriendMediation($senderPhone, $senderName, $externalPhones[0], $externalPhones[1], $text);
            }
            return [
                'handled' => true,
                'reply' => "🤝 *দুই বন্ধুর মধ্যস্থতা শুরু করতে উভয়ের WhatsApp নম্বর প্রয়োজন:*\n\n"
                         . "অনুগ্রহ করে দুইজন বন্ধুর নম্বর দিন (যেমন:\n"
                         . "`017xxxxxxxx এবং 018xxxxxxxx এর মধ্যে ঝামেলা মিটিয়ে দাও`)\n\n"
                         . "আমি কোনো পক্ষপাত ছাড়া নিরপেক্ষভাবে তাদের দুজনের সাথেই আলাদা আলাদা যোগাযোগ করে কথা শুনব। 🕊️",
                'step' => 'NEED_DUAL_FRIEND_NUMBERS',
            ];
        }

        // ৪. একক ব্যক্তির ফ্রেন্ডশিপ কেস (প্রেরক নিজে Party A)
        $prefilledFriend = $externalPhones[0] ?? null;
        return $this->initiateNewMediation($senderPhone, $senderName, $text, $prefilledFriend);
    }

    /**
     * দুই বন্ধুর জন্য স্বয়ংক্রিয় নিরপেক্ষ মধ্যস্থতা শুরু করা (Dual-Friend Mediation)
     * (অ্যাডমিন বা মধ্যস্থতাকারী শুরু করলে দুই বন্ধুকেই মেসেজ পাঠানো হবে, অ্যাডমিন কেবল নিশ্চয়তা পাবে)
     */
    public function initiateDualFriendMediation(string $initiatorPhone, string $initiatorName, string $friend1Phone, string $friend2Phone, string $text): array
    {
        $caseCode = 'MED_' . strtoupper(substr(md5(uniqid()), 0, 6));

        /** @var FriendshipMediation $mediation */
        $mediation = FriendshipMediation::create([
            'case_code' => $caseCode,
            'status' => 'STEP_1_DUAL_FRIEND_OUTREACH',
            'initiator_phone' => $initiatorPhone,
            'initiator_name' => $initiatorName ?: 'শুভাকাঙ্ক্ষী',
            'party_a_id' => $friend1Phone,
            'party_a_phone' => $friend1Phone,
            'party_a_name' => 'বন্ধু ১',
            'party_b_phone' => $friend2Phone,
            'party_b_name' => 'বন্ধু ২',
            'party_a_statement' => null,
            'party_b_statement' => null,
            'attempts_count' => 0,
            'is_terminated' => false,
            'last_interaction_at' => now(),
        ]);

        $this->logMessage($mediation->id, 'STEP_1_DUAL', $initiatorPhone, 'initiator', $text);

        $f1Disp = $this->formatDisplayPhone($friend1Phone);
        $f2Disp = $this->formatDisplayPhone($friend2Phone);

        // Friend 1-কে নিরপেক্ষ বার্তা প্রেরণ
        $outreach1 = "🌸 *আসসালামু আলাইকুম!*\n\n"
                   . "আমি *FREND* — একটি নিরপেক্ষ ও সহানুভূতিশীল AI মধ্যস্থতাকারী (Friendship Mediator)।\n\n"
                   . "আপনার এক শুভাকাঙ্ক্ষী আপনার ও আপনার বন্ধু ({$f2Disp})-এর মধ্যকার সাম্প্রতিক মনোমালিন্য বা ভুল বোঝাবুঝি দূর করার জন্য আমাকে অনুরোধ করেছেন। ওনারা আন্তরিকভাবে চান আপনাদের বন্ধুত্ব আবার আগের মতো সুন্দর হোক।\n\n"
                   . "🛡️ *আমার অবস্থান:* আমি কোনো পক্ষের নই, সম্পূর্ণ নিরপেক্ষ। কাউকে কোনো ধরনের জোর বা চাপ দেওয়া হবে না; আপনার অনুমতি ও ইচ্ছাই সর্বোচ্চ অগ্রাধিকার।\n\n"
                   . "আপনি কি আপনার দৃষ্টিকোণ থেকে বিষয়টি জানাতে আগ্রহী? আগ্রহী হলে অনুগ্রহ করে ছোট করে একটি রিপ্লাই দিন। ধন্যবাদ! 🤝";

        $this->whatsapp->sendMessage($friend1Phone, $outreach1);
        $this->logMessage($mediation->id, 'STEP_1_DUAL', $friend1Phone, 'ai_mediator', $outreach1);

        // Friend 2-কে নিরপেক্ষ বার্তা প্রেরণ
        $outreach2 = "🌸 *আসসালামু আলাইকুম!*\n\n"
                   . "আমি *FREND* — একটি নিরপেক্ষ ও সহানুভূতিশীল AI মধ্যস্থতাকারী (Friendship Mediator)।\n\n"
                   . "আপনার এক শুভাকাঙ্ক্ষী আপনার ও আপনার বন্ধু ({$f1Disp})-এর মধ্যকার সাম্প্রতিক মনোমালিন্য বা ভুল বোঝাবুঝি দূর করার জন্য আমাকে অনুরোধ করেছেন। ওনারা আন্তরিকভাবে চান আপনাদের বন্ধুত্ব আবার আগের মতো সুন্দর হোক।\n\n"
                   . "🛡️ *আমার অবস্থান:* আমি কোনো পক্ষের নই, সম্পূর্ণ নিরপেক্ষ। কাউকে কোনো ধরনের জোর বা চাপ দেওয়া হবে না; আপনার অনুমতি ও ইচ্ছাই সর্বোচ্চ অগ্রাধিকার।\n\n"
                   . "আপনি কি আপনার দৃষ্টিকোণ থেকে বিষয়টি জানাতে আগ্রহী? আগ্রহী হলে অনুগ্রহ করে ছোট করে একটি রিপ্লাই দিন। ধন্যবাদ! 🤝";

        $this->whatsapp->sendMessage($friend2Phone, $outreach2);
        $this->logMessage($mediation->id, 'STEP_1_DUAL', $friend2Phone, 'ai_mediator', $outreach2);

        // Initiator (Admin / Sender)-কে কেবল নিশ্চয়তা বার্তা প্রেরণ (কোনো অপ্রয়োজনীয় প্রশ্ন বা সেলফ-মেসেজিং নয়)
        $reply = "✅ *দুই বন্ধুর মধ্যস্থতা কার্যক্রম শুরু করা হয়েছে!*\n\n"
               . "আমি আপনার দুই বন্ধু:\n"
               . "১. `{$f1Disp}`\n"
               . "২. `{$f2Disp}`\n\n"
               . "উভয়ের WhatsApp-এ অত্যন্ত মার্জিত, সম্মানজনক ও নিরপেক্ষ বার্তা পাঠিয়ে তাদের বক্তব্য চেয়েছি। তারা সাড়া দিলে আমি নিরপেক্ষভাবে তাদের কথা শুনে ভুল বোঝাবুঝি দূর করার উদ্যোগ নেব।\n\n"
               . "🔒 _সম্পূর্ণ নিরপেক্ষতা ও গোপনীয়তা বজায় রেখে আলোচনা পরিচালিত হবে। ধন্যবাদ!_ 🤝";

        $this->logMessage($mediation->id, 'STEP_1_DUAL', null, 'ai_mediator', $reply);

        return [
            'handled' => true,
            'reply' => $reply,
            'case_code' => $caseCode,
            'step' => 'STEP_1_DUAL_FRIEND_OUTREACH',
        ];
    }

    /**
     * নতুন মধ্যস্থতা কেস শুরু করা (Step 1: একক বন্ধুর কথা মনোযোগ দিয়ে শোনা)
     */
    public function initiateNewMediation(string $partyAPhone, string $partyAName, string $text, ?string $prefilledFriendPhone = null): array
    {
        $caseCode = 'MED_' . strtoupper(substr(md5(uniqid()), 0, 6));

        /** @var FriendshipMediation $mediation */
        $mediation = FriendshipMediation::create([
            'case_code' => $caseCode,
            'status' => 'STEP_1_LISTENING_PARTY_A',
            'party_a_id' => $partyAPhone,
            'party_a_phone' => $partyAPhone,
            'party_a_name' => $partyAName ?: 'বন্ধু ১',
            'party_b_phone' => $prefilledFriendPhone,
            'party_b_name' => $prefilledFriendPhone ? 'বন্ধু ২' : null,
            'party_a_statement' => $text,
            'attempts_count' => 0,
            'is_terminated' => false,
            'last_interaction_at' => now(),
        ]);

        if (!$mediation) {
            return ['handled' => false];
        }

        $this->logMessage($mediation->id, 'STEP_1', $partyAPhone, 'party_a', $text);

        if ($prefilledFriendPhone) {
            $fDisp = $this->formatDisplayPhone($prefilledFriendPhone);
            $reply = "🤝 আমি খুব মন দিয়ে তোমার কথা শুনছি {$partyAName}। বন্ধুদের মধ্যে এমন ভুল বোঝাবুঝি বা কষ্ট পাওয়া খুব স্বাভাবিক, শান্ত হও।\n\n"
                   . "তোমার বন্ধু ({$fDisp})-এর নম্বরটি আমি নথিভুক্ত করেছি। তবে তোমার স্পষ্ট সম্মতি ছাড়া ওনাকে কোনো বার্তা পাঠাব না।\n\n"
                   . "১. ঠিক কী বিষয় নিয়ে ঝগড়া বা মনোমালিন্যটি শুরু হয়েছিল?\n"
                   . "২. বন্ধুর কোন কথা বা আচরণে তুমি সবচেয়ে বেশি কষ্ট পেয়েছো?\n"
                   . "৩. তুমি কি মন থেকে চাও এই ভুল বোঝাবুঝি মিটে যাক এবং বন্ধুত্ব আবার আগের মতো হোক?\n\n"
                   . "মন খুলে বলো, আমি কোনো পক্ষপাত ছাড়া সম্পূর্ণ নিরপেক্ষভাবে তোমাদের সাহায্য করতে প্রস্তুত।";
        } else {
            $reply = "🤝 আমি খুব মন দিয়ে তোমার কথা শুনছি {$partyAName}। বন্ধুদের মধ্যে এমন ভুল বোঝাবুঝি বা কষ্ট পাওয়া খুব স্বাভাবিক, শান্ত হও।\n\n"
                   . "১. ঠিক কী বিষয় নিয়ে ঝগড়া বা মনোমালিন্যটি শুরু হয়েছিল?\n"
                   . "২. বন্ধুর কোন কথা বা আচরণে তুমি সবচেয়ে বেশি কষ্ট পেয়েছো?\n"
                   . "৩. তুমি কি মন থেকে চাও এই ভুল বোঝাবুঝি মিটে যাক এবং বন্ধুত্ব আবার আগের মতো হোক?\n\n"
                   . "মন খুলে বলো, আমি কোনো পক্ষপাত ছাড়া সম্পূর্ণ নিরপেক্ষভাবে তোমাদের সাহায্য করতে প্রস্তুত।";
        }

        $this->logMessage($mediation->id, 'STEP_1', null, 'ai_mediator', $reply);

        return [
            'handled' => true,
            'reply' => $reply,
            'case_code' => $caseCode,
            'step' => 'STEP_1_LISTENING_PARTY_A',
        ];
    }

    /**
     * বন্ধ হওয়া মধ্যস্থতা স্বতঃস্ফূর্তভাবে পুনরায় সক্রিয়করণ (Reactivation Workflow)
     */
    public function reactivateMediation(string $senderPhone, string $senderName, string $text, ?FriendshipMediation $previousCase = null): array
    {
        $cleanSender = preg_replace('/\D/', '', $senderPhone);
        $caseCode = 'MED_RE_' . strtoupper(substr(md5(uniqid()), 0, 5));

        $friendPhone = null;
        $friendName = 'বন্ধু';

        if ($previousCase) {
            $isPrevA = $this->isPhoneMatch($senderPhone, $previousCase->party_a_phone);
            if ($isPrevA) {
                $friendPhone = $previousCase->party_b_phone;
                $friendName = $previousCase->party_b_name ?: 'বন্ধু';
            } else {
                $friendPhone = $previousCase->party_a_phone;
                $friendName = $previousCase->party_a_name ?: 'বন্ধু';
            }
        }

        // টেক্সটে যদি কোনো নতুন ফোন নম্বর থাকে
        $newPhone = $this->extractPhoneNumber($text);
        if ($newPhone) {
            $friendPhone = $newPhone;
        }

        /** @var FriendshipMediation $med */
        $med = FriendshipMediation::create([
            'case_code' => $caseCode,
            'status' => 'STEP_1_LISTENING_PARTY_A',
            'party_a_id' => $senderPhone,
            'party_a_phone' => $senderPhone,
            'party_a_name' => $senderName ?: 'বন্ধু ১',
            'party_a_statement' => $text,
            'party_b_phone' => $friendPhone,
            'party_b_name' => $friendName,
            'attempts_count' => 0,
            'is_terminated' => false,
            'last_interaction_at' => now(),
        ]);

        if (!$med) {
            return ['handled' => false];
        }

        $this->logMessage($med->id, 'REACTIVATED_STEP_1', $senderPhone, 'party_a', $text);

        // ১. নতুন করে কথা শোনা
        // ২. পরিস্থিতি পুনরায় যাচাই
        // ৩. বন্ধুর সম্মতি নেওয়া
        // ৪. আগের সীমা বজায় রাখা (সর্বোচ্চ ২ বার গ্রুপ মধ্যস্থতা)
        $reply = "🤝 *স্বাগতম {$med->party_a_name}! পুনর্মিলন প্রচেষ্টা পুনরায় সক্রিয় করা হলো।*\n\n"
               . "আমি অত্যন্ত আনন্দিত যে তুমি নিজে থেকে উদ্যোগ নিয়েছ এবং তোমার বন্ধুর সাথে সম্পর্ক ঠিক করতে চাইছ। অতীত ভুল বোঝাবুঝি বা আগের চেষ্টার ব্যর্থতাকে আমরা পেছনে রেখে সম্পূর্ণ নতুনভাবে পরিস্থিতি মূল্যায়ন করব।\n\n"
               . "📝 *নতুন পুনর্মিলন প্রক্রিয়ার ধাপসমূহ:*\n"
               . "১. *নতুন করে কথা শোনা:* তোমার বর্তমান মনের অনুভূতি, অভিমান এবং কী কী বিষয় নিয়ে তুমি নতুন করে কথা বলতে চাও, তা মন খুলে আমাকে বলো।\n"
               . "২. *পরিস্থিতি পুনরায় যাচাই:* আমরা নতুন করে সম্ভাবনা যাচাই করব যাতে কোনো তিক্ততা না থাকে।\n";

        if ($friendPhone) {
            $reply .= "৩. *বন্ধুর সম্মতি নিশ্চিতকরণ:* তোমার বক্তব্য শোনার পর তোমার স্পষ্ট অনুমতি নিয়ে তোমার বন্ধু *{$friendName}* ({$friendPhone})-এর সাথে অত্যন্ত ভদ্র ও নিরপেক্ষভাবে যোগাযোগ করব। ওনার ইচ্ছাকেও আমরা সর্বোচ্চ সম্মান জানাব।\n";
        } else {
            $reply .= "৩. *বন্ধুর সম্মতি নিশ্চিতকরণ:* তোমার অনুভূতি শোনার পর তোমার বন্ধুর নম্বর নিয়ে ওনার অনুমতি চাইব।\n";
        }

        $reply .= "৪. *আগের সীমা বজায় রাখা:* পুনরায় সক্রিয় হলেও মধ্যস্থতায় আগের মতোই সর্বোচ্চ ২ বার গ্রুপ সেশনের সীমা বলবৎ থাকবে এবং কাউকে কখনোই জোর বা বিরক্ত করা হবে না।\n\n"
               . "মন খুলে বলো, তুমি কীভাবে এই সম্পর্কটি আবার সুন্দর করে তুলতে চাও?";

        $this->logMessage($med->id, 'REACTIVATED_STEP_1', null, 'ai_mediator', $reply);

        return [
            'handled' => true,
            'reply' => $reply,
            'case_code' => $caseCode,
            'step' => 'STEP_1_LISTENING_PARTY_A',
            'is_reactivated' => true,
        ];
    }

    /**
     * Party A (প্রথম ব্যক্তি)-এর মেসেজ প্রসেসিং
     */
    protected function processPartyAMessage(FriendshipMediation $med, string $senderPhone, string $senderName, string $text): array
    {
        $this->logMessage($med->id, $med->status, $senderPhone, 'party_a', $text);
        $clean = trim($text);

        switch ($med->status) {
            case 'STEP_1_DUAL_FRIEND_OUTREACH':
                // Party A (Friend 1) replied to the dual-friend outreach
                $isRefusal = preg_match('/^(?:না|নো|no|stop|cancel)(?:[,।\s]|$)/iu', $clean)
                          || preg_match('/(?:বিরক্ত\s*করবেন\s*না|কথা\s*(?:বলব|বলবো|বলতে\s*চাই)\s*না|যোগাযোগ\s*করবেন\s*না|মেসেজ\s*দিবেন\s*না|মধ্যস্থতা\s*চাই\s*না|leave\s*me\s*alone)/iu', $clean);

                if ($isRefusal) {
                    $med->status = 'DECLINED_BY_FRIEND';
                    $med->is_terminated = true;
                    $med->closure_reason = 'FRIEND_1_DECLINED_COMMUNICATION';
                    $med->save();

                    $partyAReply = "আপনার সিদ্ধান্তকে আমি সম্পূর্ণ শ্রদ্ধা জানাচ্ছি। আপনাকে আর কোনো বার্তা বা যোগাযোগ করা হবে না। আপনার সুন্দর ও শান্তিময় জীবন কামনা করি। ভালো থাকবেন। 🌸";
                    $this->whatsapp->sendMessage($senderPhone, $partyAReply);

                    if ($med->initiator_phone) {
                        $this->whatsapp->sendMessage($med->initiator_phone, "ℹ️ আপনার বন্ধু (" . $this->formatDisplayPhone($med->party_a_phone) . ") কথা বলতে অনিচ্ছুক। ওনার সিদ্ধান্তকে সম্মান জানিয়ে মধ্যস্থতা বন্ধ করা হয়েছে।");
                    }

                    return ['handled' => true, 'reply' => $partyAReply, 'step' => 'DECLINED_BY_FRIEND'];
                }

                // Append statement to memory!
                $this->appendStatement($med, 'party_a', $clean, $senderName);
                $med->party_a_consent_contact = true;
                $med->save();

                // Check if Party B (Friend 2) has also shared their statement
                if ($med->party_b_consent_chat && !empty($med->party_b_statement)) {
                    $this->performDualPerspectiveAnalysis($med);
                    $med->status = 'STEP_5_ANALYZING_VIABILITY';
                    $med->save();

                    $analysisText = !empty($med->analysis_summary) ? $med->analysis_summary : "মূলত ভুল বোঝাবুঝি ও যোগাযোগের ঘাটতি থেকে দূরত্বের সৃষ্টি হয়েছে।";

                    $groupProposal = "🌸 আপনার মনের কথাগুলো আমি অত্যন্ত গভীর মনোযোগ ও শ্রদ্ধার সাথে অনুধাবন করেছি।\n\n"
                                   . "🔍 *আমাদের নিরপেক্ষ মনস্তাত্ত্বিক পর্যবেক্ষণ:*\n{$analysisText}\n\n"
                                   . "🤝 *পুনর্মিলনের সুযোগ:*\n"
                                   . "আপনাদের দুজনের বক্তব্যই স্পষ্ট করে যে অতীতের সুন্দর সম্পর্কের গভীর টান এখনও আপনাদের দুজনের মনেই বিদ্যমান। কেবল সাময়িক ভুল বোঝাবুঝির কারণে এই দূরত্ব তৈরি হয়েছে।\n\n"
                                   . "আমরা কি একটি নিরাপদ ও শান্ত WhatsApp গ্রুপে আপনাদের দুজনকে নিয়ে একটি গঠনমূলক ও সম্মানজনক আলোচনা শুরু করতে পারি? আমি নিজে সেখানে নিরপেক্ষ মিডিয়েটর হিসেবে আপনাদের সহায়তা করব।\n\n"
                                   . "আপনি কি গ্রুপে শান্ত আলোচনার সুযোগ দিতে প্রস্তুত? প্রস্তুত থাকলে লিখুন: `হ্যাঁ রাজি`।";

                    $this->whatsapp->sendMessage($med->party_b_phone, $groupProposal);
                    $this->logMessage($med->id, 'STEP_5', $med->party_b_phone, 'ai_mediator', $groupProposal);

                    $this->logMessage($med->id, 'STEP_5', $senderPhone, 'ai_mediator', $groupProposal);
                    return ['handled' => true, 'reply' => $groupProposal, 'step' => 'STEP_5_ANALYZING_VIABILITY'];
                } else {
                    $f2Disp = $this->formatDisplayPhone($med->party_b_phone);
                    $systemPrompt = "তুমি 'FREND' — একজন নিরপেক্ষ, সহানুভূতিশীল এবং উচ্চ মানসিক বুদ্ধিমত্তা সম্পন্ন (High EQ) ফ্রেন্ডশিপ মিডিয়েটর ও রিলেশনশিপ কাউন্সিলর।\n"
                                  . "বর্তমানে তুমি বন্ধু ১ ({$med->party_a_name})-এর সাথে ব্যক্তিগতভাবে কথা বলছো।\n\n"
                                  . "পরিস্থিতি:\n"
                                  . "দুই বন্ধুর মধ্যে ভুল বোঝাবুঝি বা মনোমালিন্য চলছে। বন্ধু ১ তার মনের কথা বা কষ্টের কথা বলছে। অপর বন্ধু ({$f2Disp})-এর কাছে নিরপেক্ষ বার্তা পাঠানো হয়েছে, তবে উনি এখনো উত্তর দেননি।\n\n"
                                  . "তোমার দায়িত্ব:\n"
                                  . "১. বন্ধু ১-এর অনুভূতি ও আবেগকে আন্তরিক স্বীকৃতি (Emotional Validation) দাও।\n"
                                  . "২. কোনো পক্ষপাত করবে না, কাউকে দোষারোপ করবে না। অপর বন্ধুর কোনো গোপনীয়তা প্রকাশ করবে না।\n"
                                  . "৩. আশ্বস্ত করো যে তার প্রতিটি বক্তব্য সুরক্ষিত রাখা হয়েছে এবং আমরা অপর বন্ধুর উত্তরের অপেক্ষায় আছি যাতে সুন্দর সমাধান তৈরি করা যায়।\n"
                                  . "৪. বন্ধু ১ যদি কোনো প্রশ্ন করে বা সংশয় প্রকাশ করে, অত্যন্ত মার্জিত, প্রজ্ঞাবান ও আশ্বস্তকারী ভাষায় উত্তর দাও।\n"
                                  . "৫. উত্তর ২-৩ বাক্যে, অত্যন্ত উষ্ণ, আন্তরিক ও সাবলীল বাংলায় দাও।";

                    $history = $this->getPartyConversationHistory($med, 'party_a');
                    $aiReply = $this->gemini->generateMediationReply($systemPrompt, $clean, $history);

                    if (empty($aiReply)) {
                        $aiReply = "🤝 ধন্যবাদ আপনার অনুভূতিগুলো শেয়ার করার জন্য। আমি খুব গভীর মনোযোগ দিয়ে আপনার প্রতিটি কথা বুঝেছি ও সুরক্ষিত রেখেছি।\n\n"
                                 . "আমি আপনার অপর বন্ধু ({$f2Disp})-এর উত্তরের অপেক্ষায় আছি। ওনার বক্তব্য পাওয়ার পর আমি নিরপেক্ষ সমাধানের পথ তৈরি করব। শান্ত হয়ে একটু অপেক্ষা করুন। 🕊️";
                    }

                    $this->logMessage($med->id, 'STEP_1_DUAL', $senderPhone, 'ai_mediator', $aiReply);
                    return ['handled' => true, 'reply' => $aiReply, 'step' => 'STEP_1_DUAL_FRIEND_OUTREACH'];
                }

            case 'STEP_1_LISTENING_PARTY_A':
                $this->appendStatement($med, 'party_a', $clean, $senderName);

                // টেক্সটে কোনো ফোন নম্বর আছে কি?
                $extractedPhone = $this->extractPhoneNumber($clean);
                if ($extractedPhone) {
                    $med->party_b_phone = $extractedPhone;
                    $med->status = 'STEP_2_REQUEST_FRIEND_CONTACT';
                    $med->save();

                    $reply = "আমি পুরো বিষয়টি বুঝতে পেরেছি {$med->party_a_name}। তোমার অনুভূতিগুলোর মূল্য অনেক।\n\n"
                           . "তুমি বন্ধুর নম্বর (" . $this->formatDisplayPhone($extractedPhone) . ") দিয়েছো। তবে তোমার স্পষ্ট সম্মতি ছাড়া আমি ওনাকে কোনো মেসেজ পাঠাবো না।\n\n"
                           . "📌 *আমি কি ওনার সাথে অত্যন্ত ভদ্র ও নিরপেক্ষভাবে যোগাযোগ করে ওনার দিকটি শুনতে পারি?*\n"
                           . "যদি তুমি রাজি থাকো, তবে লিখুন: `হ্যাঁ পাঠাও` বা `সম্মতি দিচ্ছি`।";

                    $this->logMessage($med->id, 'STEP_2', null, 'ai_mediator', $reply);
                    return ['handled' => true, 'reply' => $reply, 'step' => 'STEP_2_REQUEST_FRIEND_CONTACT'];
                }

                if (!empty($med->party_b_phone)) {
                    $med->status = 'STEP_2_REQUEST_FRIEND_CONTACT';
                    $med->save();

                    $reply = "আমি তোমার বর্তমান মানসিক অবস্থা ও অনুভূতিগুলো খুব গভীর মনোযোগ দিয়ে বুঝেছি {$med->party_a_name}।\n\n"
                           . "তোমার বন্ধু *{$med->party_b_name}* (" . $this->formatDisplayPhone($med->party_b_phone) . ")-এর কাছে কি আমি নতুনভাবে অত্যন্ত মার্জিত ও নিরপেক্ষ একটি যোগাযোগের আমন্ত্রণ পাঠাব?\n\n"
                           . "🔒 *তোমার স্পষ্ট সম্মতি প্রয়োজন:* তোমার স্পষ্ট অনুমতি ছাড়া আমি ওনাকে কোনো মেসেজ পাঠাব না। তুমি রাজি থাকলে লিখুন: `হ্যাঁ পাঠাও`।";

                    $this->logMessage($med->id, 'STEP_2', null, 'ai_mediator', $reply);
                    return ['handled' => true, 'reply' => $reply, 'step' => 'STEP_2_REQUEST_FRIEND_CONTACT'];
                }

                $systemPrompt = "তুমি 'FREND' — একজন নিরপেক্ষ, সংবেদনশীল ফ্রেন্ডশিপ মিডিয়েটর।\n"
                              . "ব্যবহারকারী বন্ধু তার কষ্ট ও ক্ষোভ শেয়ার করছে।\n"
                              . "১. তার অনুভূতির প্রতি আন্তরিক সহমর্মিতা প্রকাশ করো।\n"
                              . "২. তাকে জানাও যে অপর বন্ধুর সাথে কথা বলে ভুল বোঝাবুঝি দূর করার জন্য বন্ধুর WhatsApp নম্বর প্রয়োজন।\n"
                              . "৩. তাকে আশ্বস্ত করো যে নম্বর দিলেও তার অনুমতি ছাড়া বার্তা পাঠানো হবে না।\n"
                              . "৪. উত্তর ২-৩ বাক্যে, অত্যন্ত উষ্ণ ও সহানুভূতিশীল বাংলায় দাও।";

                $history = $this->getPartyConversationHistory($med, 'party_a');
                $aiListening = $this->gemini->generateMediationReply($systemPrompt, $clean, $history);

                if (empty($aiListening)) {
                    $aiListening = "তোমার অনুভূতি ও কষ্টের জায়গাটি আমি পরিষ্কারভাবে বুঝতে পারছি {$med->party_a_name}।\n\n"
                                 . "যদি তুমি চাও আমি একজন নিরপেক্ষ মধ্যস্থতাকারী হিসেবে তোমাদের মধ্যে কথা বলে ভুল বোঝাবুঝি দূর করার চেষ্টা করি, তবে তোমার বন্ধুর WhatsApp নম্বরটি আমাকে দাও (যেমন: `017xxxxxxxx`)।\n\n"
                                 . "_নম্বর দেওয়ার পর তোমার স্পষ্ট অনুমতি ছাড়া আমি ওনাকে কোনো মেসেজ পাঠাব না।_";
                }

                $this->logMessage($med->id, 'STEP_1', null, 'ai_mediator', $aiListening);
                return ['handled' => true, 'reply' => $aiListening, 'step' => 'STEP_1_LISTENING_PARTY_A'];

            case 'STEP_2_REQUEST_FRIEND_CONTACT':
                // ফোন নম্বর বা সম্মতির অপেক্ষা
                $extractedPhone = $this->extractPhoneNumber($clean);
                if ($extractedPhone) {
                    $med->party_b_phone = $extractedPhone;
                    $med->save();

                    $reply = "বন্ধুর নম্বর (" . $this->formatDisplayPhone($extractedPhone) . ") নথিভুক্ত হয়েছে।\n\n"
                           . "🔒 *যোগাযোগের অনুমতি:* আমি কি ওনাকে একটি ব্যক্তিগত ও নিরপেক্ষ আমন্ত্রণ পাঠাব? আপনি রাজি থাকলে বলুন: `হ্যাঁ পাঠাও`।";

                    $this->logMessage($med->id, 'STEP_2', null, 'ai_mediator', $reply);
                    return ['handled' => true, 'reply' => $reply, 'step' => 'STEP_2_REQUEST_FRIEND_CONTACT'];
                }

                if (preg_match('/(?:হ্যাঁ|হ্যা|পাঠাও|সম্মতি|yes|ok|agree|পাঠিয়ে\s*দাও)/iu', $clean)) {
                    if (empty($med->party_b_phone)) {
                        return [
                            'handled' => true,
                            'reply' => "অনুমতি দেওয়ার জন্য ধন্যবাদ! কিন্তু তোমার বন্ধুর WhatsApp ফোন নম্বরটি এখনো পাইনি। দয়া করে নম্বরটি লিখুন (যেমন: `017xxxxxxxx`)।",
                            'step' => 'STEP_2_REQUEST_FRIEND_CONTACT'
                        ];
                    }

                    $med->party_a_consent_contact = true;
                    $med->status = 'STEP_3_CONTACT_PARTY_B';
                    $med->save();

                    $this->sendInitialOutreachToPartyB($med);

                    $reply = "✅ তোমার সম্মতিক্রমে আমি তোমার বন্ধু (" . $this->formatDisplayPhone($med->party_b_phone) . ")-এর কাছে অত্যন্ত ভদ্র ও নিরপেক্ষ একটি বার্তা পাঠিয়েছি।\n\n"
                           . "আমি ওনাকে কোনো চাপ দেইনি; কেবল ওনার বক্তব্য শোনার সুযোগ দিয়েছি। উনি সাড়া দিলে আমি ওনার অনুভূতিগুলো শুনবো এবং তোমাকে জানাবো। শান্ত হয়ে একটু অপেক্ষা করো। 🤝";

                    $this->logMessage($med->id, 'STEP_3', null, 'ai_mediator', $reply);
                    return ['handled' => true, 'reply' => $reply, 'step' => 'STEP_3_CONTACT_PARTY_B'];
                }

                return [
                    'handled' => true,
                    'reply' => "আমি তোমার অনুমতির অপেক্ষায় আছি। তুমি যদি বন্ধুর সাথে মধ্যস্থতা করাতে চাও, তবে `হ্যাঁ পাঠাও` লিখুন, অথবা বাতিল করতে চাইলে `বাতিল` লিখুন।",
                    'step' => 'STEP_2_REQUEST_FRIEND_CONTACT'
                ];

            case 'STEP_5_ANALYZING_VIABILITY':
                if (preg_match('/(?:হ্যাঁ|রাজি|গ্রুপ|yes|agree|ok|সম্মতি|নিশ্চয়ই)/iu', $clean)) {
                    $med->party_a_consent_group = true;
                    $med->save();

                    if ($med->party_b_consent_group) {
                        return $this->launchGroupMediationSession($med, 1);
                    }

                    $waitReply = "🌸 আপনার আন্তরিক সদিচ্ছা ও সম্মতির জন্য ধন্যবাদ! আমি আপনার বন্ধু (" . $this->formatDisplayPhone($med->party_b_phone) . ")-এর সম্মতির অপেক্ষায় আছি। উনি সম্মতি দেওয়া মাত্রই আমাদের শান্ত ও নিরাপদ মধ্যস্থতা গ্রুপে আলোচনা শুরু হবে। 🕊️";
                    $this->logMessage($med->id, 'STEP_5', $senderPhone, 'ai_mediator', $waitReply);
                    return [
                        'handled' => true,
                        'reply' => $waitReply,
                        'step' => 'STEP_5_ANALYZING_VIABILITY'
                    ];
                }

                $isRefusalStep5 = preg_match('/^(?:না|নো|no|stop|cancel)(?:[,।\s]|$)/iu', $clean)
                    || preg_match('/(?:গ্রুপে\s*যাব\s*না|গ্রুপে\s*বসতে\s*চাই\s*না|গ্রুপ\s*(?:চাই\s*না|দরকার\s*নেই)|আলোচনা\s*চাই\s*না)/iu', $clean);
                if ($isRefusalStep5) {
                    $med->status = 'DECLINED_BY_FRIEND';
                    $med->is_terminated = true;
                    $med->closure_reason = 'PARTY_A_DECLINED_GROUP';
                    $med->save();

                    $declineReply = "আপনার সিদ্ধান্তকে শ্রদ্ধা জানাচ্ছি। কোনো বিষয়ে কাউকে বাধ্য করা আমাদের উদ্দেশ্য নয়। আপনার সুন্দর ও শান্তিময় জীবন কামনা করি। 🌸";
                    $this->whatsapp->sendMessage($senderPhone, $declineReply);

                    if (!empty($med->party_b_phone)) {
                        $this->whatsapp->sendMessage($med->party_b_phone, "ℹ️ আপনার বন্ধু এই মুহূর্তে গ্রুপ আলোচনায় বসতে প্রস্তুত নন। ওনার সিদ্ধান্তকে সম্মান জানিয়ে মধ্যস্থতা স্থগিত করা হয়েছে।");
                    }
                    return ['handled' => true, 'reply' => $declineReply, 'step' => 'DECLINED_BY_FRIEND'];
                }

                $step5Prompt = "তুমি 'FREND' নিরপেক্ষ ফ্রেন্ডশিপ মিডিয়েটর। দুই বন্ধুকে একটি নিরাপদ মীমাংসা গ্রুপে নেওয়ার প্রস্তুতি চলছে।\n"
                             . "বন্ধু ১ ({$med->party_a_name}) গ্রুপ মধ্যস্থতা নিয়ে সংশয় বা প্রশ্ন প্রকাশ করেছে: \"{$clean}\"\n\n"
                             . "তোমার দায়িত্ব:\n"
                             . "১. তাকে আশ্বস্ত করো যে গ্রুপে আমি নিজে মধ্যস্থতাকারী হিসেবে উপস্থিত থাকব এবং কোনো অসৌজন্যমূলক আচরণ বা কটু কথা বলতে দেওয়া হবে না।\n"
                             . "২. আলোচনাটি অত্যন্ত সম্মানজনক ও সৌহার্দ্যপূর্ণ হবে।\n"
                             . "৩. তাকে সাহস ও উৎসাহ দাও যাতে অতীতের সুন্দর বন্ধুত্বের খাতিরে সে একবার শান্ত আলোচনায় বসে।\n"
                             . "৪. তাকে স্মরণ করিয়ে দাও যে যদি সে প্রস্তুত থাকে তবে যেন `হ্যাঁ রাজি` লিখে জানায়।\n"
                             . "৫. উত্তর ২-৩ বাক্যে, অত্যন্ত বিনম্র ও আশ্বস্তকারী বাংলায় দাও।";

                $history = $this->getPartyConversationHistory($med, 'party_a');
                $step5Reply = $this->gemini->generateMediationReply($step5Prompt, $clean, $history);
                if (empty($step5Reply)) {
                    $step5Reply = "গ্রুপে আমি নিজে উপস্থিত থেকে আলোচনা পরিচালনা করব, যাতে কোনো প্রকার কটু কথা বা তর্ক না হয়। আপনারা নিরাপদে শান্তভাবে কথা বলতে পারবেন। আপনি প্রস্তুত থাকলে বলুন: `হ্যাঁ রাজি`। 🤝";
                }
                $this->logMessage($med->id, 'STEP_5', $senderPhone, 'ai_mediator', $step5Reply);
                return ['handled' => true, 'reply' => $step5Reply, 'step' => 'STEP_5_ANALYZING_VIABILITY'];

            case 'STEP_7_MEMBER_LEFT_ATTEMPT_1':
                $isLeaver = $this->isPhoneMatch($senderPhone, $med->first_leaver_phone);

                if ($isLeaver) {
                    if (preg_match('/(?:হ্যাঁ|হ্যা|রাজি|আরেকবার|চেষ্টা|yes|ok|try)/iu', $clean)) {
                        return $this->launchGroupMediationSession($med, 2);
                    } elseif (preg_match('/(?:না|চাই\s*না|দরকার\s*নেই|no|stop)/iu', $clean)) {
                        return $this->terminateMediationPermanently($med, 'MEMBER_DECLINED_SECOND_ATTEMPT', $med->party_a_name);
                    }
                    return [
                        'handled' => true,
                        'reply' => "আমি তোমার মনের কষ্ট বুঝতে পারছি {$med->party_a_name}। তুমি কি একটু শান্ত হয়ে আরেকবার গ্রুপে কথা বলার সুযোগ দিতে রাজি? রাজি থাকলে বলো: `হ্যাঁ রাজি`, না চাইলে বলো: `না`।",
                        'step' => 'STEP_7_MEMBER_LEFT_ATTEMPT_1'
                    ];
                }

                return [
                    'handled' => true,
                    'reply' => "শান্ত হও {$med->party_a_name}। কোনো তর্ক বা উত্তেজনা বাড়াবে না। আমি ব্যক্তিগতভাবে ওনার সাথে কথা বলে পরিস্থিতি বোঝার চেষ্টা করছি। একটু ধৈর্য ধরো।",
                    'step' => 'STEP_7_MEMBER_LEFT_ATTEMPT_1'
                ];
        }

        return [
            'handled' => true,
            'reply' => "আমি তোমার বক্তব্যটি সুরক্ষিত রেখেছি। মধ্যস্থতার বর্তমান পর্যায়: " . $this->getHumanStageName($med->status),
            'step' => $med->status
        ];
    }

    /**
     * Party B (বন্ধুর)-এর মেসেজ প্রসেসিং
     */
    protected function processPartyBMessage(FriendshipMediation $med, string $senderPhone, string $senderName, string $text): array
    {
        $this->logMessage($med->id, $med->status, $senderPhone, 'party_b', $text);
        $clean = trim($text);

        // যদি Party B যোগাযোগ প্রত্যাখ্যান করে বা বিরক্ত না করতে বলে (No Harassment Rule)
        $isRefusal = preg_match('/^(?:না|নো|no|stop|cancel)(?:[,।\s]|$)/iu', $clean)
                  || preg_match('/(?:বিরক্ত\s*করবেন\s*না|কথা\s*(?:বলব|বলবো|বলতে\s*চাই)\s*না|যোগাযোগ\s*করবেন\s*না|মেসেজ\s*দিবেন\s*না|মধ্যস্থতা\s*চাই\s*না|leave\s*me\s*alone)/iu', $clean);

        if ($isRefusal) {
            $med->status = 'DECLINED_BY_FRIEND';
            $med->is_terminated = true;
            $med->closure_reason = 'FRIEND_DECLINED_COMMUNICATION';
            $med->save();

            $partyBReply = "আপনার সিদ্ধান্তকে আমি সম্পূর্ণ শ্রদ্ধা জানাচ্ছি। আপনাকে আর কোনো মেসেজ বা যোগাযোগ করা হবে না। আপনার সুন্দর ও শান্তিময় জীবন কামনা করি। ভালো থাকবেন। 🌸";
            $this->whatsapp->sendMessage($senderPhone, $partyBReply);

            $partyANotice = "ℹ️ {$med->party_a_name}, তোমার বন্ধু এই মুহূর্তে কথা বলতে অনিচ্ছুক এবং ওনার সিদ্ধান্তকে আমাদের সম্মান জানানো উচিত।\n"
                          . "কোনো সম্পর্কে জোর করা যায় না। তাই আমি এই পুনর্মিলন প্রক্রিয়াটি সমাপ্ত করেছি। ওনাকে একটু সময় দাও, হয়তো পরে উনি নিজেই শান্ত হবেন।";
            $this->whatsapp->sendMessage($med->party_a_phone, $partyANotice);

            return ['handled' => true, 'reply' => $partyBReply, 'step' => 'DECLINED_BY_FRIEND'];
        }

        // Step 1 Dual: Party B (Friend 2) responded to the dual-friend outreach!
        if ($med->status === 'STEP_1_DUAL_FRIEND_OUTREACH') {
            $this->appendStatement($med, 'party_b', $clean, $senderName);
            $med->party_b_consent_chat = true;
            $med->save();

            // Check if Party A (Friend 1) has also shared their statement
            if ($med->party_a_consent_contact && !empty($med->party_a_statement)) {
                $this->performDualPerspectiveAnalysis($med);
                $med->status = 'STEP_5_ANALYZING_VIABILITY';
                $med->save();

                $analysisText = !empty($med->analysis_summary) ? $med->analysis_summary : "মূলত ভুল বোঝাবুঝি ও যোগাযোগের ঘাটতি থেকে দূরত্বের সৃষ্টি হয়েছে।";

                $groupProposal = "🌸 আপনার মনের কথাগুলো আমি অত্যন্ত গভীর মনোযোগ ও শ্রদ্ধার সাথে অনুধাবন করেছি।\n\n"
                               . "🔍 *আমাদের নিরপেক্ষ মনস্তাত্ত্বিক পর্যবেক্ষণ:*\n{$analysisText}\n\n"
                               . "🤝 *পুনর্মিলনের সুযোগ:*\n"
                               . "আপনাদের দুজনের বক্তব্যই স্পষ্ট করে যে অতীতের সুন্দর সম্পর্কের গভীর টান এখনও আপনাদের দুজনের মনেই বিদ্যমান। কেবল সাময়িক ভুল বোঝাবুঝির কারণে এই দূরত্ব তৈরি হয়েছে।\n\n"
                               . "আমরা কি একটি নিরাপদ ও শান্ত WhatsApp গ্রুপে আপনাদের দুজনকে নিয়ে একটি গঠনমূলক ও সম্মানজনক আলোচনা শুরু করতে পারি? আমি নিজে সেখানে নিরপেক্ষ মিডিয়েটর হিসেবে আপনাদের সহায়তা করব।\n\n"
                               . "আপনি কি গ্রুপে শান্ত আলোচনার সুযোগ দিতে প্রস্তুত? প্রস্তুত থাকলে লিখুন: `হ্যাঁ রাজি`।";

                $this->whatsapp->sendMessage($med->party_a_phone, $groupProposal);
                $this->logMessage($med->id, 'STEP_5', $med->party_a_phone, 'ai_mediator', $groupProposal);

                $this->logMessage($med->id, 'STEP_5', $senderPhone, 'ai_mediator', $groupProposal);
                return ['handled' => true, 'reply' => $groupProposal, 'step' => 'STEP_5_ANALYZING_VIABILITY'];
            } else {
                $f1Disp = $this->formatDisplayPhone($med->party_a_phone);
                $systemPrompt = "তুমি 'FREND' — একজন নিরপেক্ষ, সহানুভূতিশীল এবং উচ্চ মানসিক বুদ্ধিমত্তা সম্পন্ন (High EQ) ফ্রেন্ডশিপ মিডিয়েটর ও রিলেশনশিপ কাউন্সিলর।\n"
                              . "বর্তমানে তুমি বন্ধু ২ ({$med->party_b_name})-এর সাথে ব্যক্তিগতভাবে কথা বলছো।\n\n"
                              . "পরিস্থিতি:\n"
                              . "দুই বন্ধুর মধ্যে ভুল বোঝাবুঝি বা মনোমালিন্য চলছে। বন্ধু ২ তার মনের কথা বা কষ্টের কথা বলছে। অপর বন্ধু ({$f1Disp})-এর বক্তব্য এখনো অপেক্ষমাণ।\n\n"
                              . "তোমার দায়িত্ব:\n"
                              . "১. বন্ধু ২-এর অনুভূতি ও আবেগকে আন্তরিক স্বীকৃতি (Emotional Validation) দাও।\n"
                              . "২. কোনো পক্ষপাত করবে না, কাউকে দোষারোপ করবে না। অপর বন্ধুর কোনো গোপনীয়তা প্রকাশ করবে না।\n"
                              . "৩. আশ্বস্ত করো যে তার প্রতিটি বক্তব্য সুরক্ষিত রাখা হয়েছে এবং আমরা অপর বন্ধুর বক্তব্যের অপেক্ষায় আছি যাতে সুন্দর সমাধান তৈরি করা যায়।\n"
                              . "৪. বন্ধু ২ যদি কোনো প্রশ্ন করে বা সংশয় প্রকাশ করে, অত্যন্ত মার্জিত, প্রজ্ঞাবান ও আশ্বস্তকারী ভাষায় উত্তর দাও।\n"
                              . "৫. উত্তর ২-৩ বাক্যে, অত্যন্ত উষ্ণ, আন্তরিক ও সাবলীল বাংলায় দাও।";

                $history = $this->getPartyConversationHistory($med, 'party_b');
                $aiReply = $this->gemini->generateMediationReply($systemPrompt, $clean, $history);

                if (empty($aiReply)) {
                    $aiReply = "🤝 ধন্যবাদ আপনার অনুভূতিগুলো শেয়ার করার জন্য। আমি খুব গভীর মনোযোগ দিয়ে আপনার প্রতিটি কথা বুঝেছি ও সুরক্ষিত রেখেছি।\n\n"
                             . "আমি আপনার অপর বন্ধু ({$f1Disp})-এর উত্তরের অপেক্ষায় আছি। ওনার বক্তব্য পাওয়ার পর আমি নিরপেক্ষ সমাধানের পথ তৈরি করব। শান্ত হয়ে একটু অপেক্ষা করুন। 🕊️";
                }

                $this->logMessage($med->id, 'STEP_1_DUAL', $senderPhone, 'ai_mediator', $aiReply);
                return ['handled' => true, 'reply' => $aiReply, 'step' => 'STEP_1_DUAL_FRIEND_OUTREACH'];
            }
        }

        // Step 3: Party B সাড়া দিল এবং কথা বলতে রাজি হলো
        if ($med->status === 'STEP_3_CONTACT_PARTY_B') {
            $med->party_b_consent_chat = true;
            $med->status = 'STEP_4_LISTENING_PARTY_B';
            $med->save();

            $reply = "সাড়া দেওয়ার জন্য আপনাকে অনেক ধন্যবাদ। আমি একজন নিরপেক্ষ AI মধ্যস্থতাকারী; আমি কারও পক্ষ নেই না।\n\n"
                   . "অনুগ্রহ করে আপনার দৃষ্টিকোণ থেকে বলুন — কী নিয়ে সমস্যা হয়েছিল? কোন কথায় বা আচরণে আপনি কষ্ট পেয়েছেন?\n\n"
                   . "সম্পূর্ণ নিঃসংকোচে বলুন, আমি গভীর মনোযোগ দিয়ে আপনার কথা শুনছি।";

            $this->logMessage($med->id, 'STEP_4', null, 'ai_mediator', $reply);
            return ['handled' => true, 'reply' => $reply, 'step' => 'STEP_4_LISTENING_PARTY_B'];
        }

        // Step 4: Party B তার বক্তব্য জানালো
        if ($med->status === 'STEP_4_LISTENING_PARTY_B') {
            $this->appendStatement($med, 'party_b', $clean, $senderName);
            $med->status = 'STEP_5_ANALYZING_VIABILITY';
            $med->save();

            $this->performDualPerspectiveAnalysis($med);

            $analysisText = !empty($med->analysis_summary) ? $med->analysis_summary : "মূলত ভুল বোঝাবুঝি ও আবেগের কারণে এই দূরত্বের সৃষ্টি হয়েছে।";

            $groupProposal = "আপনার কথাগুলো অত্যন্ত মূল্যবান এবং আমি আপনার অনুভূতিগুলো গভীর শ্রদ্ধার সাথে অনুধাবন করেছি।\n\n"
                           . "🔍 *আমাদের নিরপেক্ষ মনস্তাত্ত্বিক পর্যবেক্ষণ:*\n{$analysisText}\n\n"
                           . "🤝 *পুনর্মিলনের সুযোগ:* {$med->party_a_name} আন্তরিকভাবে সব ভুল বোঝাবুঝি দূর করতে চায়।\n\n"
                           . "আমরা কি একটি নিরাপদ WhatsApp গ্রুপে আপনাদের দুজনকে নিয়ে একটি গঠনমূলক ও শান্ত আলোচনা শুরু করতে পারি?\n"
                           . "আপনি রাজি থাকলে লিখুন: `হ্যাঁ রাজি`।";

            $this->whatsapp->sendMessage($med->party_a_phone, $groupProposal);
            $this->logMessage($med->id, 'STEP_5', $med->party_a_phone, 'ai_mediator', $groupProposal);

            $this->logMessage($med->id, 'STEP_5', $senderPhone, 'ai_mediator', $groupProposal);
            return ['handled' => true, 'reply' => $groupProposal, 'step' => 'STEP_5_ANALYZING_VIABILITY'];
        }

        // Step 5: Party B গ্রুপে আসতে সম্মতি দিল
        if ($med->status === 'STEP_5_ANALYZING_VIABILITY') {
            if (preg_match('/(?:হ্যাঁ|রাজি|yes|agree|ok|সম্মতি|নিশ্চয়ই)/iu', $clean)) {
                $med->party_b_consent_group = true;
                $med->save();

                if ($med->party_a_consent_group) {
                    return $this->launchGroupMediationSession($med, 1);
                }

                $partyANotice = "🌸 *সুসংবাদ {$med->party_a_name}!* তোমার বন্ধু কথা বলতে এবং গ্রুপ আলোচনায় বসতে সম্মতি দিয়েছে।\n\n"
                              . "তুমি কি গ্রুপে শান্ত ও সৌহার্দ্যপূর্ণভাবে আলোচনা শুরু করতে প্রস্তুত? রাজি থাকলে লিখুন: `হ্যাঁ রাজি`।";
                $this->whatsapp->sendMessage($med->party_a_phone, $partyANotice);

                $reply = "ধন্যবাদ আপনার সম্মতির জন্য! {$med->party_a_name}-এর চূড়ান্ত সম্মতি নিশ্চিত হওয়া মাত্রই আমরা মধ্যস্থতা গ্রুপে আলোচনা শুরু করব। 🕊️";
                return ['handled' => true, 'reply' => $reply, 'step' => 'STEP_5_ANALYZING_VIABILITY'];
            }

            $isRefusalStep5B = preg_match('/^(?:না|নো|no|stop|cancel)(?:[,।\s]|$)/iu', $clean)
                || preg_match('/(?:গ্রুপে\s*যাব\s*না|গ্রুপে\s*বসতে\s*চাই\s*না|গ্রুপ\s*(?:চাই\s*না|দরকার\s*নেই)|আলোচনা\s*চাই\s*না)/iu', $clean);
            if ($isRefusalStep5B) {
                $med->status = 'DECLINED_BY_FRIEND';
                $med->is_terminated = true;
                $med->closure_reason = 'PARTY_B_DECLINED_GROUP';
                $med->save();

                $declineReply = "আপনার সিদ্ধান্তকে শ্রদ্ধা জানাচ্ছি। কোনো বিষয়ে কাউকে বাধ্য করা আমাদের উদ্দেশ্য নয়। আপনার সুন্দর ও শান্তিময় জীবন কামনা করি। 🌸";
                $this->whatsapp->sendMessage($senderPhone, $declineReply);

                if (!empty($med->party_a_phone)) {
                    $this->whatsapp->sendMessage($med->party_a_phone, "ℹ️ আপনার বন্ধু এই মুহূর্তে গ্রুপ আলোচনায় বসতে প্রস্তুত নন। ওনার সিদ্ধান্তকে সম্মান জানিয়ে মধ্যস্থতা স্থগিত করা হয়েছে।");
                }
                return ['handled' => true, 'reply' => $declineReply, 'step' => 'DECLINED_BY_FRIEND'];
            }

            $step5PromptB = "তুমি 'FREND' নিরপেক্ষ ফ্রেন্ডশিপ মিডিয়েটর। দুই বন্ধুকে একটি নিরাপদ মীমাংসা গ্রুপে নেওয়ার প্রস্তুতি চলছে।\n"
                          . "বন্ধু ২ ({$med->party_b_name}) গ্রুপ মধ্যস্থতা নিয়ে সংশয় বা প্রশ্ন প্রকাশ করেছে: \"{$clean}\"\n\n"
                          . "তোমার দায়িত্ব:\n"
                          . "১. তাকে আশ্বস্ত করো যে গ্রুপে আমি নিজে মধ্যস্থতাকারী হিসেবে উপস্থিত থাকব এবং কোনো অসৌজন্যমূলক আচরণ বা কটু কথা বলতে দেওয়া হবে না।\n"
                          . "২. আলোচনাটি অত্যন্ত সম্মানজনক ও সৌহার্দ্যপূর্ণ হবে।\n"
                          . "৩. তাকে সাহস ও উৎসাহ দাও যাতে অতীতের সুন্দর বন্ধুত্বের খাতিরে সে একবার শান্ত আলোচনায় বসে।\n"
                          . "৪. তাকে স্মরণ করিয়ে দাও যে যদি সে প্রস্তুত থাকে তবে যেন `হ্যাঁ রাজি` লিখে জানায়।\n"
                          . "৫. উত্তর ২-৩ বাক্যে, অত্যন্ত বিনম্র ও আশ্বস্তকারী বাংলায় দাও।";

            $history = $this->getPartyConversationHistory($med, 'party_b');
            $step5ReplyB = $this->gemini->generateMediationReply($step5PromptB, $clean, $history);
            if (empty($step5ReplyB)) {
                $step5ReplyB = "গ্রুপে আমি নিজে উপস্থিত থেকে আলোচনা পরিচালনা করব, যাতে কোনো প্রকার কটু কথা বা তর্ক না হয়। আপনারা নিরাপদে শান্তভাবে কথা বলতে পারবেন। আপনি প্রস্তুত থাকলে বলুন: `হ্যাঁ রাজি`। 🤝";
            }
            $this->logMessage($med->id, 'STEP_5', $senderPhone, 'ai_mediator', $step5ReplyB);
            return ['handled' => true, 'reply' => $step5ReplyB, 'step' => 'STEP_5_ANALYZING_VIABILITY'];
        }

        // Step 7: প্রথমবার গ্রুপ ছেড়ে যাওয়া ব্যক্তির সাথে ব্যক্তিগত ফরোয়ার্ড
        if ($med->status === 'STEP_7_MEMBER_LEFT_ATTEMPT_1') {
            if (preg_match('/(?:হ্যাঁ|রাজি|আরেকবার|yes|ok|try)/iu', $clean)) {
                return $this->launchGroupMediationSession($med, 2);
            } else {
                return $this->terminateMediationPermanently($med, 'MEMBER_DECLINED_SECOND_ATTEMPT');
            }
        }

        return [
            'handled' => true,
            'reply' => "আপনার বার্তাটি সুরক্ষিত রয়েছে। ধন্যবাদ আপনার সহযোগিতার জন্য।",
            'step' => $med->status
        ];
    }

    /**
     * Step 3: Party B-কে নিরপেক্ষ ও ভদ্র প্রথম বার্তা প্রেরণ
     */
    protected function sendInitialOutreachToPartyB(FriendshipMediation $med): void
    {
        $isReactivated = str_starts_with($med->case_code, 'MED_RE_');

        if ($isReactivated) {
            $message = "🌸 *আসসালামু আলাইকুম!*\n\n"
                     . "আমি *FREND* — আপনার শুভাকাঙ্ক্ষী ও নিরপেক্ষ AI মধ্যস্থতাকারী হিসেবে আপনাকে অত্যন্ত শ্রদ্ধার সাথে লিখছি।\n\n"
                     . "আপনার বন্ধু *{$med->party_a_name}* অতীতের ভুল বোঝাবুঝি বা আগের তিক্ততা পেছনে ফেলে সম্পূর্ণ নতুনভাবে আপনার সাথে কথা বলতে এবং সম্পর্ক ঠিক করতে আন্তরিক ইচ্ছা প্রকাশ করেছে।\n\n"
                     . "ও আপনার বন্ধুত্বকে অত্যন্ত মূল্য দেয় এবং চায় একটি সুন্দর সৌহার্দ্যপূর্ণ সম্পর্ক ফিরে আসুক।\n\n"
                     . "🛡️ *আমার অবস্থান:* আগের মতোই আমি সম্পূর্ণ নিরপেক্ষ এবং অতীত কোনো ব্যর্থতাকে টেনে আনা হবে না।\n\n"
                     . "📌 আপনাকে কথা বলতে বা বন্ধুত্ব ঠিক করতে কোনো প্রকার চাপ দেওয়া হচ্ছে না। সিদ্ধান্ত ও পছন্দ সম্পূর্ণ আপনার এবং আপনার ইচ্ছাকে সর্বোচ্চ সম্মান জানানো হবে।\n\n"
                     . "আপনি কি ওনার এই আন্তরিক উদ্যোগকে স্বাগত জানিয়ে নতুন করে একবার কথা বলার বা শান্ত আলোচনার সুযোগ দিতে আগ্রহী? আগ্রহী হলে অনুগ্রহ করে ছোট করে একটি রিপ্লাই দিন। ধন্যবাদ! 🤝";
        } else {
            $message = "🌸 *আসসালামু আলাইকুম!*\n\n"
                     . "আমি *FREND* — একটি নিরপেক্ষ ও সহানুভূতিশীল AI মধ্যস্থতাকারী হিসেবে আপনাকে অত্যন্ত শ্রদ্ধার সাথে নক দিচ্ছি।\n\n"
                     . "আপনার বন্ধু *{$med->party_a_name}* আপনাদের মধ্যকার সাম্প্রতিক ভুল বোঝাবুঝি বা মনোমালিন্য নিয়ে মানসিকভাবে খুব ব্যথিত। ও আপনার বন্ধুত্বকে অত্যন্ত মূল্য দেয় এবং চায় সব ভুল বোঝাবুঝি দূর হোক।\n\n"
                     . "🛡️ *আমার উদ্দেশ্য:* আমি কোনো একজনের পক্ষ নেওয়ার জন্য আসিনি। আমি উভয় পক্ষের অনুভূতি ও দৃষ্টিকোণ নিরপেক্ষভাবে বুঝে আপনাদের শান্ত আলোচনার সুযোগ করে দিতে চাই।\n\n"
                     . "📌 আপনাকে কথা বলতে বা বন্ধুত্ব ঠিক করতে কোনো প্রকার চাপ দেওয়া হচ্ছে না। সিদ্ধান্ত সম্পূর্ণ আপনার।\n\n"
                     . "আপনি কি আপনার দৃষ্টিকোণ থেকে বিষয়টি জানাতে আগ্রহী? আগ্রহী হলে অনুগ্রহ করে ছোট করে একটি রিপ্লাই দিন। ধন্যবাদ! 🤝";
        }

        $this->whatsapp->sendMessage($med->party_b_phone, $message);
        $this->logMessage($med->id, 'STEP_3', $med->party_b_phone, 'ai_mediator', $message);
    }

    /**
     * Step 4 & 5: দুই পক্ষের বক্তব্য নিরপেক্ষ ও মনস্তাত্ত্বিক বিশ্লেষণ (Dual Perspective Synthesis)
     */
    protected function performDualPerspectiveAnalysis(FriendshipMediation $med): void
    {
        try {
            $analysis = $this->gemini->analyzeConflict(
                $med->party_a_name ?: 'বন্ধু ১',
                $med->party_a_statement ?: '',
                $med->party_b_name ?: 'বন্ধু ২',
                $med->party_b_statement ?: ''
            );
            $med->analysis_summary = $analysis;
            $med->save();
        } catch (Exception $e) {
            $med->analysis_summary = "উভয় পক্ষের বক্তব্য বিশ্লেষণ করে দেখা গেছে যে মূলত ভুল বোঝাবুঝি ও যোগাযোগের ঘাটতি থেকে দূরত্বের সৃষ্টি হয়েছে। কিন্তু দুজনের মনেই একে অপরের প্রতি শ্রদ্ধা ও অতীতের বন্ধুত্বের টান রয়েছে। শান্ত আলোচনার মাধ্যমে সুন্দর সমাধান সম্ভব।";
            $med->save();
        }
    }

    /**
     * Step 6 & 8: WhatsApp গ্রুপ তৈরি ও মধ্যস্থতা সেশন চালু (Attempt 1 বা 2)
     */
    public function launchGroupMediationSession(FriendshipMediation $med, int $attemptNumber): array
    {
        $med->attempts_count = $attemptNumber;
        $med->status = ($attemptNumber === 1) ? 'STEP_6_GROUP_MEDIATION_ACTIVE' : 'STEP_8_GROUP_MEDIATION_ACTIVE_2';
        $med->save();

        $groupTitle = "বন্ধুত্ব ও সমঝোতা 🤝 (চেষ্টা #{$attemptNumber})";
        $participants = [$med->party_a_phone, $med->party_b_phone];

        // গ্রুপ তৈরি
        $groupRes = $this->whatsapp->createGroup($groupTitle, $participants);
        $groupId = $groupRes['groupId'] ?? null;
        $inviteLink = $groupRes['inviteLink'] ?? null;

        if (!$groupId) {
            $groupId = 'group_' . strtolower($med->case_code) . '@g.us';
        }
        $med->group_id = $groupId;
        if ($inviteLink) {
            $med->group_invite_link = $inviteLink;
        }
        $med->save();

        // গ্রুপে উদ্বোধনী ও নিরপেক্ষ মধ্যস্থতা বার্তা
        $welcomeMsg = "🕊️ *আসসালামু আলাইকুম ও স্বাগতম!*\n\n"
                    . "আমি *FREND*, আপনাদের দুজনের নিরপেক্ষ ফ্রেন্ডশিপ মিডিয়েটর। আপনারা দুজনেই এই আলোচনার জন্য সম্মতি দিয়েছেন, এজন্য আপনাদের ধন্যবাদ।\n\n"
                    . "📋 *গ্রুপে আলোচনার কিছু সহজ নিয়ম:*\n"
                    . "১. অনুগ্রহ করে কেউ উত্তেজিত হবেন না বা কটু কথা বলবেন না।\n"
                    . "২. একজন কথা বলার সময় অন্যজন মনোযোগ দিয়ে শুনবেন।\n"
                    . "৩. অতীত তিক্ততা নয়, ভুল বোঝাবুঝি দূর করাই আমাদের মূল লক্ষ্য।\n\n"
                    . "বন্ধুত্ব অনেক মূল্যবান। আসুন শান্তভাবে কথা বলে মনের সব দ্বিধাদ্বন্দ্ব দূর করি। {$med->party_a_name}, আপনি প্রথমে শান্তভাবে আপনার কথাটি সংক্ষেপে বলুন। 🤝";

        if ($groupId) {
            $this->whatsapp->sendMessage($groupId, $welcomeMsg);
        } else {
            // যদি সরাসরি গ্রুপ আইডি না পাওয়া যায় তবে ইনভাইট লিঙ্ক পাঠানো
            $bridgeNotice = "👥 সমঝোতা গ্রুপ প্রস্তুত হয়েছে! অনুগ্রহ করে নিচের লিঙ্কে ক্লিক করে যুক্ত হোন:\n🔗 {$inviteLink}";
            $this->whatsapp->sendMessage($med->party_a_phone, $bridgeNotice);
            $this->whatsapp->sendMessage($med->party_b_phone, $bridgeNotice);
        }

        $this->logMessage($med->id, $med->status, $groupId, 'ai_mediator', $welcomeMsg);

        return [
            'handled' => true,
            'reply' => "গ্রুপ মধ্যস্থতা সফলভাবে চালু হয়েছে (চেষ্টা #{$attemptNumber})।",
            'step' => $med->status,
            'invite_link' => $inviteLink,
        ];
    }

    /**
     * গ্রুপ মেসেজ প্রসেসিং ও আলোচনা পরিচালনা
     */
    protected function processGroupMessage(FriendshipMediation $med, string $senderPhone, string $senderName, string $text): array
    {
        $this->logMessage($med->id, $med->status, $senderPhone, 'group_member', $text);
        $clean = trim($text);

        // যদি কেউ ক্ষমা চায় বা মিল হয়ে যাওয়ার কথা বলে
        if (preg_match('/(?:ক্ষমা|সরি|sorry|ভুল\s*হয়েছে|ভুল\s*হয়েছিল|মাফ|মিল|দোস্ত|বন্ধু|সব\s*ঠিক|মিটে\s*গেছে|ভালোবাসি)/iu', $clean)) {
            $peaceReply = "🌸 মাশাআল্লাহ! ভুল স্বীকার করা এবং ক্ষমা করা মহত্ত্বের লক্ষণ।\n\n"
                        . "আপনাদের দুজনের মধ্যকার ভুল বোঝাবুঝি দূর হয়ে বন্ধুত্ব পুনরায় স্বাভাবিক হওয়ার এই সিদ্ধান্ত সত্যিই প্রশংসনীয়।\n\n"
                        . "সবসময় এভাবেই একে অপরের পাশে থাকবেন। সুন্দর বন্ধুত্বের শুভকামনা রইল! 🤝❤️";

            $this->whatsapp->sendMessage($med->group_id, $peaceReply);
            $med->status = 'RESOLVED';
            $med->is_terminated = true;
            $med->reconciliation_outcome = 'MUTUAL_FRIENDSHIP_RECONCILIATION_ACHIEVED';
            $med->save();

            $this->logMessage($med->id, 'RESOLVED', $med->group_id, 'ai_mediator', $peaceReply);
            return ['handled' => true, 'reply' => $peaceReply, 'step' => 'RESOLVED'];
        }

        $isPartyA = $this->isPhoneMatch($senderPhone, $med->party_a_phone);
        $speakerName = $isPartyA ? ($med->party_a_name ?: 'বন্ধু ১') : ($med->party_b_name ?: 'বন্ধু ২');
        $otherName = $isPartyA ? ($med->party_b_name ?: 'বন্ধু ২') : ($med->party_a_name ?: 'বন্ধু ১');

        // মধ্যস্থতাকারী হিসেবে উত্তেজনা প্রশমন ও নিরপেক্ষ পথ দেখানো (Gemini Mediator)
        try {
            $aiMod = $this->gemini->moderateGroupMessage($clean, $speakerName, $otherName, $med->analysis_summary);
            $this->whatsapp->sendMessage($med->group_id, $aiMod);
            $this->logMessage($med->id, $med->status, $med->group_id, 'ai_mediator', $aiMod);
            return ['handled' => true, 'reply' => $aiMod, 'step' => $med->status];
        } catch (Exception $e) {}

        return ['handled' => true, 'reply' => 'ধন্যবাদ, শান্তভাবে আলোচনা চালিয়ে যান। 🕊️'];
    }

    /**
     * Step 7 & Step 9: গ্রুপ ছেড়ে চলে যাওয়ার ইভেন্ট হ্যান্ডলার (Group Leave Event)
     */
    public function handleGroupMemberLeftEvent(string $groupId, string $leaverPhone): array
    {
        $med = FriendshipMediation::where('group_id', $groupId)
            ->where('is_terminated', false)
            ->first();

        if (!$med) {
            return ['handled' => false, 'reason' => 'No active mediation case found for this group'];
        }

        $isPartyA = $this->isPhoneMatch($leaverPhone, $med->party_a_phone);
        $remainingPhone = $isPartyA ? $med->party_b_phone : $med->party_a_phone;
        $remainingName = $isPartyA ? $med->party_b_name : $med->party_a_name;
        $leaverName = $isPartyA ? $med->party_a_name : $med->party_b_name;

        // ─── প্রথমবার গ্রুপ ছেড়ে গেলে (Step 7: First Leave Event) ───
        if ($med->attempts_count === 1 && $med->status === 'STEP_6_GROUP_MEDIATION_ACTIVE') {
            $med->first_leaver_phone = $leaverPhone;
            $med->status = 'STEP_7_MEMBER_LEFT_ATTEMPT_1';
            $med->save();

            // ১. গ্রুপে / বাকি থাকা ব্যক্তিকে শান্ত থাকতে বলা
            $calmRemaining = "⚠️ {$leaverName} এই মুহূর্তে কিছুটা আবেগপ্রবণ বা অভিমানী হয়ে গ্রুপ ছেড়ে গেছেন।\n\n"
                           . "{$remainingName}, অনুগ্রহ করে শান্ত থাকুন এবং কোনো প্রকার রাগ বা তর্ক বাড়াবেন না।\n\n"
                           . "আমি ব্যক্তিগতভাবে একবার ওনার সাথে কথা বলে পরিস্থিতি বোঝার চেষ্টা করছি। ধৈর্য ধরুন। 🤝";
            $this->whatsapp->sendMessage($remainingPhone, $calmRemaining);

            // ২. গ্রুপ ছেড়ে যাওয়া ব্যক্তির সাথে ব্যক্তিগতভাবে একবার যোগাযোগ (No Harassment Rule)
            $reachoutLeaver = "🌸 আসসালামু আলাইকুম {$leaverName},\n\n"
                            . "আমি বুঝতে পারছি আপনি হয়তো পরিস্থিতিটিতে কষ্ট পেয়েছেন বা বিরক্ত হয়েছেন। আপনার মানসিক অবস্থাকে আমি সম্মান জানাই।\n\n"
                            . "আপনি কেন গ্রুপ ছেড়েছেন, সে বিষয়ে কি একটু বলতে চান? আপনি কি একটু শান্ত হওয়ার পর আরেকবার আলোচনা করার সুযোগ দিতে আগ্রহী?\n\n"
                            . "📌 _যদি আপনি আর কথা বলতে না চান, তবে শুধু 'না' লিখলেই আমি যোগাযোগ বন্ধ করে দেব।_";

            $this->whatsapp->sendMessage($leaverPhone, $reachoutLeaver);
            $this->logMessage($med->id, 'STEP_7_MEMBER_LEFT_ATTEMPT_1', $leaverPhone, 'ai_mediator', $reachoutLeaver);

            return [
                'handled' => true,
                'action' => 'STEP_7_LEAVER_CONTACTED_ONCE',
                'leaver_phone' => $leaverPhone,
            ];
        }

        // ─── দ্বিতীয়বার গ্রুপ ছেড়ে গেলে (Step 9: Second Leave Event -> Permanent Shutdown) ───
        if ($med->attempts_count >= 2 || $med->status === 'STEP_8_GROUP_MEDIATION_ACTIVE_2') {
            return $this->terminateMediationPermanently($med, 'SECOND_LEAVE_ABORTED', $leaverName);
        }

        return ['handled' => false];
    }

    /**
     * Step 9: দ্বিতীয়বার গ্রুপ ছাড়লে বা সীমাবদ্ধতায় পৌঁছালে AI মধ্যস্থতা সম্পূর্ণভাবে স্থায়ী বন্ধ
     */
    public function terminateMediationPermanently(FriendshipMediation $med, string $reason, ?string $leaverName = null): array
    {
        $med->status = 'STEP_9_TERMINATED_PERMANENTLY';
        $med->is_terminated = true;
        $med->closure_reason = $reason;
        $med->second_leaver_phone = $leaverName;
        $med->reconciliation_outcome = 'MEDIATION_PERMANENTLY_TERMINATED_AFTER_MAX_ATTEMPTS';
        $med->save();

        $finalClosingMessage = "🕊️ *চূড়ান্ত বিবৃতি: পুনর্মিলন প্রচেষ্টা সমাপ্ত*\n\n"
                             . "উভয় পক্ষের মানসিক সীমানা ও ইচ্ছাকে সম্মান জানিয়ে ফ্রেন্ডশিপ মিডিয়েশন প্রক্রিয়াটি এখানেই স্থায়ীভাবে সমাপ্ত ঘোষণা করা হলো।\n\n"
                             . "📌 *সুরক্ষা নিশ্চিতকরণ:*\n"
                             . "• কাউকে আর কোনো মেসেজ বা ফোন পাঠানো হবে না।\n"
                             . "• নতুন কোনো গ্রুপ তৈরি করা হবে না।\n"
                             . "• কাউকে জোর করার আর কোনো উদ্যোগ নেওয়া হবে না।\n\n"
                             . "আপনারা দুজনেই ভালো থাকুন এবং ভবিষ্যতে আপনাদের জীবনের মঙ্গল হোক। বিদায়। 🌸";

        // উভয় পক্ষকে চূড়ান্ত নিরপেক্ষ বার্তা দেওয়া
        if (!empty($med->party_a_phone)) {
            $this->whatsapp->sendMessage($med->party_a_phone, $finalClosingMessage);
        }
        if (!empty($med->party_b_phone)) {
            $this->whatsapp->sendMessage($med->party_b_phone, $finalClosingMessage);
        }

        // গ্রুপে থাকলে গ্রুপেও বার্তা দেওয়া
        if (!empty($med->group_id)) {
            $this->whatsapp->sendMessage($med->group_id, $finalClosingMessage);
        }

        $this->logMessage($med->id, 'STEP_9_TERMINATED_PERMANENTLY', null, 'ai_mediator', $finalClosingMessage);

        return [
            'handled' => true,
            'action' => 'STEP_9_PERMANENT_SHUTDOWN',
            'reason' => $reason,
        ];
    }

    /**
     * পুনরায় মিলতে চাওয়া বা পুনর্মিলন সক্রিয় করার ইচ্ছা শনাক্তকারী ইনটেন্ট
     */
    public function isReactivationIntent(string $text): bool
    {
        $phones = $this->extractAllPhoneNumbers($text);
        if (count($phones) >= 2) {
            return false;
        }

        $t = mb_strtolower($text, 'UTF-8');
        
        $reconcileActions = '(?:মিলতে|মিটমাট|কথা\s*বলতে|সম্পর্ক\s*ঠিক|বন্ধুত্ব\s*ঠিক|পুনর্মিলন|ভুল\s*বোঝাবুঝি\s*মিটাতে|এক\s*হতে|আগের\s*মতো\s*হতে|সমঝোতা|মিলে\s*যেতে|মিটিয়ে\s*নিতে|মিল\s*হতে)';
        $intentMarkers = '(?:চাই|চাচ্ছি|ইচ্ছা|আগ্রহী|ভাবছি|পারব|হবে|করব|করতে\s*চাই|চেষ্টা\s*করতে\s*চাই)';
        $againWords = '(?:আবার|নতুন\s*করে|পুনরায়|পুনরায়|আরেকবার|দ্বিতীয়বার|দ্বিতীয়\s*সুযোগ|আরেকটা\s*চান্স)';

        return (bool) preg_match("/{$againWords}.*?{$reconcileActions}/iu", $t)
            || (bool) preg_match("/{$reconcileActions}.*?{$againWords}/iu", $t)
            || (bool) preg_match("/{$againWords}.*?(?:বন্ধু|দোস্ত|ফ্রেন্ড|ওর).*?(?:কথা|মিল|সম্পর্ক)/iu", $t)
            || (bool) preg_match('/(?:আবার\s*বন্ধুত্ব|পুনরায়\s*সক্রিয়|পুনরায়\s*সক্রিয়|reactivate|restart\s*mediation)/iu', $t);
    }

    /**
     * বন্ধুত্বে ঝগড়া/মনোমালিন্য শনাক্তকারী ইনটেন্ট
     */
    public function isFriendshipConflictIntent(string $text): bool
    {
        // যদি মেসেজে ২টি বা ততোধিক ফোন নম্বর থাকে, তবে তা সরাসরি দুই বন্ধুর মধ্যস্থতার তথ্য হিসেবে গণ্য
        if (count($this->extractAllPhoneNumbers($text)) >= 2) {
            return true;
        }

        $t = mb_strtolower($text, 'UTF-8');
        $conflictWords = '(?:ঝগড়া|ঝগড়া|ঝামেলা|মনোমালিন্য|রাগারাগি|কথা\s*বন্ধ|অভিমান|ভুল\s*বোঝাবুঝি|বিবাদ|কষ্ট|মারামারি|fight|conflict)';
        $friendWords = '(?:বন্ধু|বন্ধুর|দোস্ত|দোস্তের|ফ্রেন্ড|ফ্রেন্ডের|friend)';

        return (bool) preg_match("/{$friendWords}.*?{$conflictWords}/iu", $t)
            || (bool) preg_match("/{$conflictWords}.*?{$friendWords}/iu", $t)
            || (bool) preg_match('/(?:ঝগড়া|ঝগড়া|ঝামেলা|মনোমালিন্য)\s*(?:হয়েছে|হইছে|করছি|করলাম)/iu', $t)
            || (bool) preg_match('/(?:মিটিয়ে|মিলিয়ে|সমাধান|ঠিক\s*করে)\s*(?:দাও|দিন|করব)/iu', $t)
            || (bool) preg_match('/(?:বন্ধুত্ব\s*ঠিক|পুনর্মিলন|সমঝোতা|মিডিয়েশন|মিডিয়েশন|mediation|friendship\s*conflict)/iu', $t);
    }

    /**
     * বার্তা থেকে সমস্ত বাংলাদেশী মোবাইল ফোন নম্বর নিষ্কাশন
     */
    public function extractAllPhoneNumbers(string $text): array
    {
        preg_match_all('/(?:\+?88)?(01[3-9]\d{8})/u', $text, $matches);
        if (empty($matches[1])) {
            return [];
        }

        $phones = [];
        foreach ($matches[1] as $num) {
            $full = '88' . $num;
            if (!in_array($full, $phones)) {
                $phones[] = $full;
            }
        }
        return $phones;
    }

    /**
     * ফোন নম্বর নিষ্কাশন (প্রথম নম্বর)
     */
    protected function extractPhoneNumber(string $text): ?string
    {
        $all = $this->extractAllPhoneNumbers($text);
        return $all[0] ?? null;
    }

    /**
     * ব্যবহারকারীর দেখার জন্য ফোন নম্বর সুন্দর ফরম্যাটে প্রদর্শন
     */
    public function formatDisplayPhone(?string $phone): string
    {
        if (!$phone) return '';
        $digits = preg_replace('/\D/', '', $phone);
        if (str_starts_with($digits, '8801') && strlen($digits) === 13) {
            return substr($digits, 2);
        }
        if (strlen($digits) === 11 && str_starts_with($digits, '01')) {
            return $digits;
        }
        return $phone;
    }

    /**
     * পর্যায় নাম বাংলায় প্রদর্শন
     */
    public function getHumanStageName(string $status): string
    {
        $stages = [
            'STEP_1_DUAL_FRIEND_OUTREACH' => 'উভয় বন্ধুর সাথে পৃথক নিরপেক্ষ যোগাযোগ ও অনুভূতি গ্রহণ',
            'NEED_DUAL_FRIEND_NUMBERS' => 'উভয় বন্ধুর নম্বর গ্রহণের অপেক্ষা',
            'STEP_1_LISTENING_PARTY_A' => 'প্রথম বন্ধুর বক্তব্য গ্রহণ ও সান্ত্বনা',
            'STEP_2_REQUEST_FRIEND_CONTACT' => 'বন্ধুর নম্বর ও সম্মতি গ্রহণ',
            'STEP_3_CONTACT_PARTY_B' => 'বন্ধুর সাথে ব্যক্তিগত ও নিরপেক্ষ যোগাযোগ',
            'STEP_4_LISTENING_PARTY_B' => 'বন্ধুর বক্তব্য ও অনুভূতি গ্রহণ',
            'STEP_5_ANALYZING_VIABILITY' => 'উভয় পক্ষের বিশ্লেষণ ও গ্রুপ মধ্যস্থতার সম্মতি',
            'STEP_6_GROUP_MEDIATION_ACTIVE' => 'গ্রুপ মধ্যস্থতা সেশন সক্রিয় (চেষ্টা #১)',
            'STEP_7_MEMBER_LEFT_ATTEMPT_1' => 'গ্রুপ সদস্য ত্যাগ: শান্ত রাখা ও একবার ব্যক্তিগত যোগাযোগ',
            'STEP_8_GROUP_MEDIATION_ACTIVE_2' => 'দ্বিতীয় পুনর্মিলন গ্রুপ সেশন সক্রিয় (চেষ্টা #২)',
            'STEP_9_TERMINATED_PERMANENTLY' => 'মধ্যস্থতা প্রক্রিয়া স্থায়ীভাবে সমাপ্ত (সুরক্ষিত নিষ্ক্রিয়)',
            'RESOLVED' => 'পুনর্মিলন ও সমঝোতা সফল',
            'DECLINED_BY_FRIEND' => 'বন্ধু যোগাযোগে অসম্মতি জানিয়েছে (শ্রদ্ধা জানিয়ে বন্ধ)',
        ];

        return $stages[$status] ?? $status;
    }

    /**
     * লগ সংরক্ষণ
     */
    protected function logMessage(int $mediationId, string $stage, ?string $senderPhone, string $role, string $body): void
    {
        try {
            FriendshipMediationLog::create([
                'mediation_id' => $mediationId,
                'stage' => $stage,
                'sender_phone' => $senderPhone,
                'sender_role' => $role,
                'message_body' => $body,
                'created_at' => now(),
            ]);
        } catch (Exception $e) {}
    }
}
