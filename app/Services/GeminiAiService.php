<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Http;
use Exception;

/**
 * Gemini AI Service — Pure PHP Bengali & English Natural Language Processing
 * 
 * cPanel শেয়ার্ড হোস্টিংয়ে কোনো Node.js লাইব্রেরি ছাড়াই সরাসরি
 * Google Gemini API দিয়ে:
 * ১. বাংলা/ইংরেজি মেসেজ থেকে তারিখ, সময় ও রিমাইন্ডার শনাক্ত করা
 * ২. স্বয়ংক্রিয় ট্যাগ ও নোট তৈরি করা
 * ৩. ফ্রেন্ড বটের বুদ্ধিমান বাংলা উত্তর তৈরি করা
 */
class GeminiAiService
{
    protected ?string $apiKey;
    protected string $model = 'gemini-2.5-flash';

    public function __construct(?string $apiKey = null)
    {
        $this->apiKey = $apiKey 
            ?? Setting::get('GEMINI_API_KEY')
            ?? (function_exists('env') ? \env('GEMINI_API_KEY') : null);
    }

    /**
     * মেসেজ থেকে রিমাইন্ডার বা ইভেন্ট বিশ্লেষণ করা
     * @return array [hasEvent, eventText, timeHint, parsedDateTime, suggestion]
     */
    public function analyzeMessageForReminder(string $text): array
    {
        if (empty($this->apiKey)) {
            return [
                'hasEvent' => false,
                'error' => 'GEMINI_API_KEY কনফিগার করা নেই।',
            ];
        }

        $systemPrompt = <<<PROMPT
তুমি একটি বাংলা/ইংরেজি রিমাইন্ডার বিশ্লেষক বট। ব্যবহারকারীর টেক্সটে কোনো ভবিষ্যৎ কাজ, সময় বা রিমাইন্ডার আছে কিনা শনাক্ত করো।
বর্তমান সময়: বাংলাদেশের সময় অনুযায়ী।

আউটপুট অবশ্যই কেবল JSON ফরম্যাটে হতে হবে:
{
  "hasEvent": true,
  "eventText": "কাজের বিষয় (বাংলায়)",
  "timeHint": "সময়ের বর্ণনা (যেমন: কাল সকাল ১০টা, পরশু)",
  "estimatedMinutesFromNow": 60,
  "suggestion": "ব্যবহারকারীকে দেওয়ার মতো সুন্দর বাংলা রিপ্লাই"
}

যদি কোনো ভবিষ্যৎ কাজ না থাকে:
{
  "hasEvent": false,
  "suggestion": "সাধারণ চ্যাট রিপ্লাই"
}
PROMPT;

        try {
            $response = Http::timeout(10)->post("https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent?key={$this->apiKey}", [
                'contents' => [
                    [
                        'role' => 'user',
                        'parts' => [
                            ['text' => "{$systemPrompt}\n\nমেসেজ: \"{$text}\""],
                        ],
                    ],
                ],
                'generationConfig' => [
                    'temperature' => 0.2,
                    'responseMimeType' => 'application/json',
                ],
            ]);

            if ($response->successful()) {
                $data = $response->json();
                $content = $data['candidates'][0]['content']['parts'][0]['text'] ?? '{}';
                return json_decode($content, true) ?: ['hasEvent' => false];
            }
        } catch (Exception $e) {
            // Fallback gracefully
        }

        return ['hasEvent' => false];
    }

    /**
     * সাধারণ বাংলা চ্যাট ও প্রশ্নের উত্তর দেওয়া
     */
    public function chatReply(string $text, string $userName = 'বন্ধু'): string
    {
        if (empty($this->apiKey)) {
            return "আমি আপনার রিমাইন্ডার ও নোট মনে রাখার সহকারী ফ্রেন্ড! কী সাহায্য করতে পারি?";
        }

        $prompt = "তুমি 'FREND' নামের একটি বুদ্ধিমান, বিশ্বস্ত ও বন্ধুসুলভ হোয়াটসঅ্যাপ সহকারী। ব্যবহারকারীর নাম {$userName}। ব্যবহারকারীর কথার সংক্ষিপ্ত ও সুন্দর বাংলা রিপ্লাই দাও:\n\n{$text}";

        try {
            $response = Http::timeout(10)->post("https://generativelanguage.googleapis.com/v1beta/models/{$this->model}:generateContent?key={$this->apiKey}", [
                'contents' => [
                    [
                        'parts' => [['text' => $prompt]],
                    ],
                ],
                'generationConfig' => [
                    'temperature' => 0.7,
                    'maxOutputTokens' => 300,
                ],
            ]);

            if ($response->successful()) {
                $data = $response->json();
                return $data['candidates'][0]['content']['parts'][0]['text'] ?? 'আমি শুনতে পাচ্ছি!';
            }
        } catch (Exception $e) {}

        return "দুঃখিত, এই মুহূর্তে উত্তর তৈরিতে কিছুটা সমস্যা হচ্ছে। তবে আপনার মেসেজটি সংরক্ষিত আছে!";
    }
}
