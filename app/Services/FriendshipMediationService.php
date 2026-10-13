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
            $isPartyA = str_contains($activeMediation->party_a_phone, $cleanPhone);
            $isPartyB = $activeMediation->party_b_phone && str_contains($activeMediation->party_b_phone, $cleanPhone);

            if ($isPartyA) {
                return $this->processPartyAMessage($activeMediation, $senderPhone, $senderName, $text);
            } elseif ($isPartyB) {
                return $this->processPartyBMessage($activeMediation, $senderPhone, $senderName, $text);
            }
        }

        // ৩. নতুন মধ্যস্থতা শুরু করার ইচ্ছা শনাক্তকরণ (Initiator starting Step 1)
        if ($this->isFriendshipConflictIntent($text)) {
            return $this->initiateNewMediation($senderPhone, $senderName, $text);
        }

        return null;
    }

    /**
     * নতুন মধ্যস্থতা কেস শুরু করা (Step 1: প্রথম ব্যক্তির কথা মনোযোগ দিয়ে শোনা)
     */
    public function initiateNewMediation(string $partyAPhone, string $partyAName, string $text): array
    {
        $caseCode = 'MED_' . strtoupper(substr(md5(uniqid()), 0, 6));

        $mediation = FriendshipMediation::create([
            'case_code' => $caseCode,
            'status' => 'STEP_1_LISTENING_PARTY_A',
            'party_a_id' => $partyAPhone,
            'party_a_phone' => $partyAPhone,
            'party_a_name' => $partyAName ?: 'বন্ধু ১',
            'party_a_statement' => $text,
            'attempts_count' => 0,
            'is_terminated' => false,
            'last_interaction_at' => now(),
        ]);

        $this->logMessage($mediation->id, 'STEP_1', $partyAPhone, 'party_a', $text);

        // AI সহানুভূতির সাথে কথা শুনবে এবং পরিস্থিতি শান্ত করার জন্য প্রশ্ন করবে
        $reply = "🤝 আমি খুব মন দিয়ে তোমার কথা শুনছি {$partyAName}। বন্ধুদের মধ্যে এমন ভুল বোঝাবুঝি বা কষ্ট পাওয়া খুব স্বাভাবিক, শান্ত হও।\n\n"
               . "১. ঠিক কী বিষয় নিয়ে ঝগড়া বা মনোমালিন্যটি শুরু হয়েছিল?\n"
               . "২. বন্ধুর কোন কথা বা আচরণে তুমি সবচেয়ে বেশি কষ্ট পেয়েছো?\n"
               . "৩. তুমি কি মন থেকে চাও এই ভুল বোঝাবুঝি মিটে যাক এবং বন্ধুত্ব আবার আগের মতো হোক?\n\n"
               . "মন খুলে বলো, আমি কোনো পক্ষপাত ছাড়া সম্পূর্ণ নিরপেক্ষভাবে তোমাদের সাহায্য করতে প্রস্তুত।";

        $this->logMessage($mediation->id, 'STEP_1', null, 'ai_mediator', $reply);

        return [
            'handled' => true,
            'reply' => $reply,
            'case_code' => $caseCode,
            'step' => 'STEP_1_LISTENING_PARTY_A',
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
            case 'STEP_1_LISTENING_PARTY_A':
                // Party A পরিস্থিতি বুঝিয়ে বলল, এবার বন্ধুর নম্বর ও সম্মতি চাওয়ার ধাপ (Step 2)
                $med->party_a_statement .= "\n• " . $clean;

                // টেক্সটে কোনো ফোন নম্বর আছে কি?
                $extractedPhone = $this->extractPhoneNumber($clean);
                if ($extractedPhone) {
                    $med->party_b_phone = $extractedPhone;
                    $med->status = 'STEP_2_REQUEST_FRIEND_CONTACT';
                    $med->save();

                    $reply = "আমি পুরো বিষয়টি বুঝতে পেরেছি {$med->party_a_name}। তোমার অনুভূতিগুলোর মূল্য অনেক।\n\n"
                           . "তুমি বন্ধুর নম্বর ({$extractedPhone}) দিয়েছো। তবে তোমার স্পষ্ট সম্মতি ছাড়া আমি ওনাকে কোনো মেসেজ পাঠাবো না।\n\n"
                           . "📌 *আমি কি ওনার সাথে অত্যন্ত ভদ্র ও নিরপেক্ষভাবে যোগাযোগ করে ওনার দিকটি শুনতে পারি?*\n"
                           . "যদি তুমি রাজি থাকো, তবে লিখুন: `হ্যাঁ পাঠাও` বা `সম্মতি দিচ্ছি`।";

                    $this->logMessage($med->id, 'STEP_2', null, 'ai_mediator', $reply);
                    return ['handled' => true, 'reply' => $reply, 'step' => 'STEP_2_REQUEST_FRIEND_CONTACT'];
                }

                $med->status = 'STEP_2_REQUEST_FRIEND_CONTACT';
                $med->save();

                $reply = "তোমার অনুভূতি ও কষ্টের জায়গাটি আমি পরিষ্কারভাবে বুঝতে পারছি {$med->party_a_name}।\n\n"
                       . "যদি তুমি চাও আমি একজন নিরপেক্ষ মধ্যস্থতাকারী হিসেবে তোমাদের মধ্যে কথা বলে ভুল বোঝাবুঝি দূর করার চেষ্টা করি, তবে তোমার বন্ধুর WhatsApp নম্বরটি আমাকে দাও (যেমন: `017xxxxxxxx`)।\n\n"
                       . "_নম্বর দেওয়ার পর তোমার স্পষ্ট অনুমতি ছাড়া আমি ওনাকে কোনো মেসেজ পাঠাব না।_";

                $this->logMessage($med->id, 'STEP_2', null, 'ai_mediator', $reply);
                return ['handled' => true, 'reply' => $reply, 'step' => 'STEP_2_REQUEST_FRIEND_CONTACT'];

            case 'STEP_2_REQUEST_FRIEND_CONTACT':
                // ফোন নম্বর বা সম্মতির অপেক্ষা
                $extractedPhone = $this->extractPhoneNumber($clean);
                if ($extractedPhone) {
                    $med->party_b_phone = $extractedPhone;
                    $med->save();

                    $reply = "বন্ধুর নম্বর ({$extractedPhone}) নথিভুক্ত হয়েছে।\n\n"
                           . "🔒 *যোগাযোগের অনুমতি:* আমি কি ওনাকে একটি ব্যক্তিগত ও নিরপেক্ষ আমন্ত্রণ পাঠাব? আপনি রাজি থাকলে বলুন: `হ্যাঁ পাঠাও`।";

                    $this->logMessage($med->id, 'STEP_2', null, 'ai_mediator', $reply);
                    return ['handled' => true, 'reply' => $reply, 'step' => 'STEP_2_REQUEST_FRIEND_CONTACT'];
                }

                // সম্মতি দিলে Step 3 কার্যকর করা (বন্ধুর সঙ্গে ব্যক্তিগত যোগাযোগ)
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

                    // Step 3: বন্ধুকে নিরপেক্ষ ও ব্যক্তিগত মেসেজ প্রেরণ
                    $this->sendInitialOutreachToPartyB($med);

                    $reply = "✅ তোমার সম্মতিক্রমে আমি তোমার বন্ধু ({$med->party_b_phone})-এর কাছে অত্যন্ত ভদ্র ও নিরপেক্ষ একটি বার্তা পাঠিয়েছি।\n\n"
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
                // গ্রুপ মধ্যস্থতার জন্য Party A-এর সম্মতি
                if (preg_match('/(?:হ্যাঁ|রাজি|গ্রুপ|yes|agree)/iu', $clean)) {
                    $med->party_a_consent_group = true;
                    $med->save();

                    if ($med->party_b_consent_group) {
                        return $this->launchGroupMediationSession($med, 1);
                    }

                    return [
                        'handled' => true,
                        'reply' => "তোমার সম্মতি পেয়েছি! আমি তোমার বন্ধুর সম্মতির অপেক্ষায় আছি। উনি রাজি হওয়া মাত্রই গ্রুপে শান্তিপূর্ণ আলোচনা শুরু হবে।",
                        'step' => 'STEP_5_ANALYZING_VIABILITY'
                    ];
                }
                break;

            case 'STEP_7_MEMBER_LEFT_ATTEMPT_1':
                // প্রথমবার কেউ গ্রুপ ছাড়লে Leaver ও Remaining আলাদা হ্যান্ডলিং
                $cleanLeaver = preg_replace('/\D/', '', $med->first_leaver_phone ?? '');
                $cleanSender = preg_replace('/\D/', '', $senderPhone);
                $isLeaver = $cleanLeaver && str_contains($cleanSender, $cleanLeaver);

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
            'reply' => "আমি তোমার বক্তব্যটি নথিভুক্ত করেছি। মধ্যস্থতার বর্তমান পর্যায়: " . $this->getHumanStageName($med->status),
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
        $isRefusal = preg_match('/^(?:না|নো|no|stop)(?:[,।\s]|$)/iu', $clean)
                  || preg_match('/(?:বিরক্ত\s*করবেন\s*না|কথা\s*বলব\s*না|কথা\s*বলতে\s*চাই\s*না|দরকার\s*নেই|leave\s*me\s*alone|চাই\s*না|যোগাযোগ\s*করবেন\s*না|মেসেজ\s*দিবেন\s*না)/iu', $clean);

        if ($isRefusal) {
            $med->status = 'DECLINED_BY_FRIEND';
            $med->is_terminated = true;
            $med->closure_reason = 'FRIEND_DECLINED_COMMUNICATION';
            $med->save();

            // বন্ধুকে সম্মানজনক বিদায় বার্তা
            $partyBReply = "আপনার সিদ্ধান্তকে আমি সম্পূর্ণ শ্রদ্ধা জানাচ্ছি। আপনাকে আর কোনো মেসেজ বা যোগাযোগ করা হবে না। আপনার সুন্দর ও শান্তিময় জীবন কামনা করি। ভালো থাকবেন। 🌸";
            $this->whatsapp->sendMessage($senderPhone, $partyBReply);

            // Party A-কে ফলাফল জানানো
            $partyANotice = "ℹ️ {$med->party_a_name}, তোমার বন্ধু এই মুহূর্তে কথা বলতে অনিচ্ছুক এবং ওনার সিদ্ধান্তকে আমাদের সম্মান জানানো উচিত।\n"
                          . "কোনো সম্পর্কে জোর করা যায় না। তাই আমি এই পুনর্মিলন প্রক্রিয়াটি সমাপ্ত করেছি। ওনাকে একটু সময় দাও, হয়তো পরে উনি নিজেই শান্ত হবেন।";
            $this->whatsapp->sendMessage($med->party_a_phone, $partyANotice);

            return ['handled' => true, 'reply' => $partyBReply, 'step' => 'DECLINED_BY_FRIEND'];
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
            $med->party_b_statement = $clean;
            $med->status = 'STEP_5_ANALYZING_VIABILITY';
            $med->save();

            // উভয় পক্ষের বক্তব্য নিরপেক্ষ বিশ্লেষণ করা (Step 4 & 5)
            $this->performDualPerspectiveAnalysis($med);

            $reply = "আপনার কথাগুলো অত্যন্ত মূল্যবান এবং আমি আপনার অনুভূতিগুলো গভীর শ্রদ্ধার সাথে অনুধাবন করেছি।\n\n"
                   . "আমি উভয় পক্ষের বক্তব্য বিশ্লেষণ করে দেখেছি যে মূলত কিছু ভুল বোঝাবুঝি ও আবেগের কারণে এই দূরত্বের সৃষ্টি হয়েছে।\n\n"
                   . "🤝 *পুনর্মিলনের সম্ভাবনা:* {$med->party_a_name} আন্তরিকভাবে সব ভুল বোঝাবুঝি দূর করতে চায়।\n\n"
                   . "আমরা কি একটি নিরাপদ WhatsApp গ্রুপে আপনাদের দুজনকে নিয়ে একটি গঠনমূলক ও শান্ত আলোচনা শুরু করতে পারি?\n"
                   . "আপনি রাজি থাকলে লিখুন: `হ্যাঁ রাজি`।";

            $this->logMessage($med->id, 'STEP_5', null, 'ai_mediator', $reply);
            return ['handled' => true, 'reply' => $reply, 'step' => 'STEP_5_ANALYZING_VIABILITY'];
        }

        // Step 5: Party B গ্রুপে আসতে সম্মতি দিল
        if ($med->status === 'STEP_5_ANALYZING_VIABILITY') {
            if (preg_match('/(?:হ্যাঁ|রাজি|yes|agree|ok|সম্মতি)/iu', $clean)) {
                $med->party_b_consent_group = true;
                $med->save();

                if ($med->party_a_consent_group) {
                    return $this->launchGroupMediationSession($med, 1);
                }

                // Party A-এর সম্মতি চাওয়া
                $partyANotice = "🌸 *সুসংবাদ {$med->party_a_name}!* তোমার বন্ধু কথা বলতে এবং গ্রুপ আলোচনায় বসতে সম্মতি দিয়েছে।\n\n"
                              . "তুমি কি গ্রুপে শান্ত ও সৌহার্দ্যপূর্ণভাবে আলোচনা শুরু করতে প্রস্তুত? রাজি থাকলে লিখুন: `হ্যাঁ রাজি`।";
                $this->whatsapp->sendMessage($med->party_a_phone, $partyANotice);

                $reply = "ধন্যবাদ আপনার সম্মতির জন্য! {$med->party_a_name}-এর চূড়ান্ত সম্মতি নিশ্চিত হওয়া মাত্রই আমরা মধ্যস্থতা গ্রুপে আলোচনা শুরু করব।";
                return ['handled' => true, 'reply' => $reply, 'step' => 'STEP_5_ANALYZING_VIABILITY'];
            }
        }

        // Step 7: প্রথমবার গ্রুপ ছেড়ে যাওয়া ব্যক্তির সাথে ব্যক্তিগত ফরোয়ার্ড
        if ($med->status === 'STEP_7_MEMBER_LEFT_ATTEMPT_1') {
            // leaver রাজি হলে Step 8 চালু
            if (preg_match('/(?:হ্যাঁ|রাজি|আরেকবার|yes|ok|try)/iu', $clean)) {
                return $this->launchGroupMediationSession($med, 2);
            } else {
                // রাজি না হলে স্থায়ী সমাপ্তি
                return $this->terminateMediationPermanently($med, 'MEMBER_DECLINED_SECOND_ATTEMPT');
            }
        }

        return [
            'handled' => true,
            'reply' => "আপনার বার্তাটি নথিভুক্ত হয়েছে। ধন্যবাদ আপনার সহযোগিতার জন্য।",
            'step' => $med->status
        ];
    }

    /**
     * Step 3: Party B-কে নিরপেক্ষ ও ভদ্র প্রথম বার্তা প্রেরণ
     */
    protected function sendInitialOutreachToPartyB(FriendshipMediation $med): void
    {
        $message = "🌸 *আসসালামু আলাইকুম!*\n\n"
                 . "আমি *FREND* — একটি নিরপেক্ষ ও সহানুভূতিশীল AI মধ্যস্থতাকারী হিসেবে আপনাকে অত্যন্ত শ্রদ্ধার সাথে নক দিচ্ছি।\n\n"
                 . "আপনার বন্ধু *{$med->party_a_name}* আপনাদের মধ্যকার সাম্প্রতিক ভুল বোঝাবুঝি বা মনোমালিন্য নিয়ে মানসিকভাবে খুব ব্যথিত। ও আপনার বন্ধুত্বকে অত্যন্ত মূল্য দেয় এবং চায় সব ভুল বোঝাবুঝি দূর হোক।\n\n"
                 . "🛡️ *আমার উদ্দেশ্য:* আমি কোনো একজনের পক্ষ নেওয়ার জন্য আসিনি। আমি উভয় পক্ষের অনুভূতি ও দৃষ্টিকোণ নিরপেক্ষভাবে বুঝে আপনাদের শান্ত আলোচনার সুযোগ করে দিতে চাই।\n\n"
                 . "📌 আপনাকে কথা বলতে বা বন্ধুত্ব ঠিক করতে কোনো প্রকার চাপ দেওয়া হচ্ছে না। সিদ্ধান্ত সম্পূর্ণ আপনার।\n\n"
                 . "আপনি কি আপনার দৃষ্টিকোণ থেকে বিষয়টি জানাতে আগ্রহী? আগ্রহী হলে অনুগ্রহ করে ছোট করে একটি রিপ্লাই দিন। ধন্যবাদ! 🤝";

        $this->whatsapp->sendMessage($med->party_b_phone, $message);
        $this->logMessage($med->id, 'STEP_3', $med->party_b_phone, 'ai_mediator', $message);
    }

    /**
     * Step 4 & 5: দুই পক্ষের বক্তব্য বিশ্লেষণ
     */
    protected function performDualPerspectiveAnalysis(FriendshipMediation $med): void
    {
        $analysisPrompt = "তুমি একজন বিশেষজ্ঞ নিরপেক্ষ ফ্রেন্ডশিপ মেডিয়েটর ও সাইকোলজিস্ট।\n"
                        . "উভয় পক্ষের বক্তব্য বিশ্লেষণ করো:\n\n"
                        . "বন্ধু ১ ({$med->party_a_name}) এর বক্তব্য:\n{$med->party_a_statement}\n\n"
                        . "বন্ধু ২ এর বক্তব্য:\n{$med->party_b_statement}\n\n"
                        . "সংক্ষেপে (৩-৪ লাইনে) নিরপেক্ষভাবে চিহ্নিত করো: মূল ভুল বোঝাবুঝি কোথায় হয়েছে এবং কীভাবে উভয়ে শান্ত হতে পারে।";

        try {
            $res = $this->gemini->chatReply($analysisPrompt, 'মিডিয়েটর');
            $med->analysis_summary = $res;
            $med->save();
        } catch (Exception $e) {
            $med->analysis_summary = "মূলত পারস্পরিক প্রত্যাশা ও যোগাযোগের ঘাটতি থেকে এই ভুল বোঝাবুঝির সৃষ্টি হয়েছে। শান্ত আলোচনার মাধ্যমে সমাধান সম্ভব।";
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
        if (preg_match('/(?:ক্ষমা|সরি|ভুল\s*হয়েছে|মাফ|মিল|দোস্ত|বন্ধু|সব\s*ঠিক|মিটে\s*গেছে)/iu', $clean)) {
            $peaceReply = "🌸 মাশাআল্লাহ! ভুল স্বীকার করা এবং ক্ষমা করা মহত্ত্বের লক্ষণ।\n\n"
                        . "আপনাদের দুজনের মধ্যকার ভুল বোঝাবুঝি দূর হয়ে বন্ধুত্ব পুনরায় স্বাভাবিক হওয়ার এই সিদ্ধান্ত সত্যিই প্রশংসনীয়।\n\n"
                        . "সবসময় এভাবেই একে অপরের পাশে থাকবেন। সুন্দর বন্ধুত্বের শুভকামনা রইল! 🤝❤️";

            $this->whatsapp->sendMessage($med->group_id, $peaceReply);
            $med->status = 'RESOLVED';
            $med->is_terminated = true;
            $med->reconciliation_outcome = 'MUTUAL_FRIENDSHIP_RECONCILIATION_ACHIEVED';
            $med->save();

            return ['handled' => true, 'reply' => $peaceReply, 'step' => 'RESOLVED'];
        }

        // মধ্যস্থতাকারী হিসেবে উত্তেজনা প্রশমন ও নিরপেক্ষ পথ দেখানো
        $moderatorPrompt = "তুমি 'FREND' নিরপেক্ষ ফ্রেন্ডশিপ মিডিয়েটর। গ্রুপে মধ্যস্থতা চলছে।\n"
                         . "সদস্যের কথা: \"{$clean}\"\n"
                         . "সংক্ষেপে (১-৩ বাক্যে) নিরপেক্ষভাবে উত্তেজনা প্রশমন করো এবং অপর পক্ষকে শান্তভাবে প্রতিক্রিয়া জানাতে বলো।";

        try {
            $aiMod = $this->gemini->chatReply($moderatorPrompt, 'মিডিয়েটর');
            $this->whatsapp->sendMessage($med->group_id, $aiMod);
            $this->logMessage($med->id, $med->status, $med->group_id, 'ai_mediator', $aiMod);
            return ['handled' => true, 'reply' => $aiMod, 'step' => $med->status];
        } catch (Exception $e) {}

        return ['handled' => true, 'reply' => 'ধন্যবাদ, শান্তভাবে আলোচনা চালিয়ে যান।'];
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

        $cleanLeaver = preg_replace('/\D/', '', $leaverPhone);
        $isPartyA = str_contains($med->party_a_phone, $cleanLeaver);
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
     * বন্ধুত্বে ঝগড়া/মনোমালিন্য শনাক্তকারী ইনটেন্ট
     */
    public function isFriendshipConflictIntent(string $text): bool
    {
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
     * ফোন নম্বর নিষ্কাশন
     */
    protected function extractPhoneNumber(string $text): ?string
    {
        if (preg_match('/(?:\+?88)?(01[3-9]\d{8})/u', $text, $m)) {
            return '88' . $m[1];
        }
        return null;
    }

    /**
     * পর্যায় নাম বাংলায় প্রদর্শন
     */
    public function getHumanStageName(string $status): string
    {
        $stages = [
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
