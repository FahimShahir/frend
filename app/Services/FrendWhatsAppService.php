<?php

namespace App\Services;

use Exception;

/**
 * Frend WhatsApp Assistant — Laravel & PHP Integration Service
 * 
 * এই ক্লাসের মাধ্যমে Laravel বা যেকোনো PHP অ্যাপ্লিকেশন থেকে:
 * ১. Node.js বট চালু (npm start / Start Bot) করা যায়
 * ২. লাইভ QR কোড সরাসরি ব্রাউজার UI-তে দেখা ও স্ক্যান করা যায় (টার্মিনাল ছাড়া)
 * ৩. WhatsApp স্ট্যাটাস দেখা, বট রিস্টার্ট এবং ডিসকানেক্ট করা যায়
 * ৪. যেকোনো নম্বরে সরাসরি WhatsApp বার্তা পাঠানো যায়
 * 
 * (এটি স্বয়ংক্রিয়ভাবে Laravel Http এবং নেটিভ PHP cURL উভয়ই সাপোর্ট করে,
 * ফলে কোনো ডিপেন্ডেন্সি মিসিং এরর হবে না)
 */
class FrendWhatsAppService
{
    protected string $baseUrl;
    protected string $nodeProjectPath;

    public function __construct(?string $baseUrl = null, ?string $nodeProjectPath = null)
    {
        // ডিফল্ট Node.js FREND সার্ভার পোর্ট 3000
        $this->baseUrl = $baseUrl
            ?? (function_exists('env') ? \env('FREND_BOT_URL') : null)
            ?? ($_ENV['FREND_BOT_URL'] ?? null)
            ?? (getenv('FREND_BOT_URL') ?: null)
            ?? 'http://127.0.0.1:3000';

        // Node.js প্রজেক্টের পাথ (যদি একই সার্ভারে/শেয়ার্ড হোস্টিংয়ে থাকে)
        $customPath = $nodeProjectPath
            ?? (function_exists('env') ? \env('FREND_BOT_PATH') : null)
            ?? ($_ENV['FREND_BOT_PATH'] ?? null);

        if ($customPath && ($resolved = realpath($customPath) ?: (function_exists('base_path') ? realpath(\base_path($customPath)) : null))) {
            $this->nodeProjectPath = $resolved;
        } else {
            $this->nodeProjectPath = function_exists('base_path')
                ? \base_path('whatsapp_bot_runner')
                : dirname(__DIR__, 2) . '/whatsapp_bot_runner';
        }
    }

    /**
     * বটের লাইভ স্ট্যাটাস এবং QR কোড পাওয়া
     * @return array [status, qrImage, userName, userPhone, connectedAt]
     */
    public function getStatus(): array
    {
        $res = $this->request('GET', '/api/bot/status', null, 3);
        if ($res && isset($res['status'])) {
            return $res;
        }

        return [
            'status' => 'OFFLINE',
            'qrImage' => null,
            'userName' => null,
            'userPhone' => null,
            'connectedAt' => null,
            'error' => 'FREND Node.js সার্ভার চালু নেই বা সংযোগ পাওয়া যায়নি।'
        ];
    }

    /**
     * Laravel অ্যাডমিন UI থেকে সরাসরি Node.js বট চালু করা (npm start / node index.js)
     * শেয়ার্ড হোস্টিং বা লোকাল সার্ভারে ব্যাকগ্রাউন্ডে বট রান করে।
     */
    public function startBotProcess(): array
    {
        // প্রথমে চেক করি বট আগে থেকেই চালু আছে কিনা
        $current = $this->getStatus();
        if ($current['status'] !== 'OFFLINE') {
            return [
                'success' => true,
                'message' => 'বট ইতিমধ্যে চালু আছে!',
                'status' => $current['status']
            ];
        }

        // Smart auto-detection for whatsapp_bot_runner
        $candidates = [
            $this->nodeProjectPath,
            function_exists('base_path') ? \base_path('whatsapp_bot_runner') : null,
            function_exists('base_path') ? \base_path() : null,
            dirname(__DIR__, 2) . '/whatsapp_bot_runner',
        ];

        $path = null;
        foreach ($candidates as $cand) {
            if ($cand && ($rp = realpath($cand)) && file_exists($rp . '/index.js')) {
                $path = $rp;
                $this->nodeProjectPath = $rp;
                break;
            }
        }

        if (!$path || !file_exists($path . '/index.js')) {
            return [
                'success' => false,
                'message' => 'Node.js ফাইল খুঁজে পাওয়া যায়নি। FREND_BOT_PATH পাথটি .env-এ সঠিক করে দিন অথবা cPanel-এর "Setup Node.js App" থেকে চালু করুন।'
            ];
        }

        try {
            if (strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
                // Windows Server / Localhost
                $cmd = "cd /d \"{$path}\" && start /B npm start";
                pclose(popen($cmd, "r"));
            } else {
                // Linux / cPanel Shared Hosting
                $cmd = "cd \"{$path}\" && nohup npm start > frend_output.log 2>&1 &";
                shell_exec($cmd);
            }

            sleep(2);
            $newStatus = $this->getStatus();

            return [
                'success' => true,
                'message' => 'বট চালু করার কমান্ড সফলভাবে পাঠানো হয়েছে!',
                'status' => $newStatus['status']
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => 'বট চালু করতে সমস্যা: ' . $e->getMessage()
            ];
        }
    }

    /**
     * Laravel থেকে সরাসরি WhatsApp মেসেজ পাঠানো
     * 
     * @param string $to ফোন নম্বর (যেমন: 01712345678 বা 8801712345678)
     * @param string $message পাঠানোর বার্তা
     * @return array
     */
    public function sendMessage(string $to, string $message): array
    {
        $res = $this->request('POST', '/api/send-message', [
            'to' => $to,
            'message' => $message,
        ], 10);

        if ($res && isset($res['success'])) {
            return $res;
        }

        return [
            'success' => false,
            'error' => 'মেসেজ পাঠাতে সমস্যা হয়েছে। বট চালু আছে কিনা নিশ্চিত করুন।'
        ];
    }

    /**
     * Laravel অ্যাডমিন থেকে বট রিস্টার্ট করা
     */
    public function restartBot(): array
    {
        $res = $this->request('POST', '/api/bot/restart', null, 5);
        if ($res) {
            return $res;
        }
        return ['success' => false, 'error' => 'বট রিস্টার্ট কমান্ড পাঠানো যায়নি।'];
    }

    /**
     * WhatsApp সেশন লগআউট / ডিসকানেক্ট করা
     */
    public function logoutBot(): array
    {
        $res = $this->request('POST', '/api/bot/logout', null, 5);
        if ($res) {
            return $res;
        }
        return ['success' => false, 'error' => 'ডিসকানেক্ট কমান্ড ব্যর্থ হয়েছে।'];
    }

    /**
     * সক্রিয় রিমাইন্ডার ও কাজসমূহ দেখা
     */
    public function getReminders(): array
    {
        $res = $this->request('GET', '/api/data', null, 4);
        return $res ?? ['reminders' => []];
    }

    /**
     * অভ্যন্তরীণ HTTP রিকোয়েস্ট হ্যান্ডলার (Laravel Http বা নেটিভ cURL স্বয়ংক্রিয়ভাবে ব্যবহার করে)
     */
    protected function request(string $method, string $path, ?array $data = null, int $timeout = 5): ?array
    {
        $url = rtrim($this->baseUrl, '/') . $path;

        // ১. Laravel পরিবেশ হলে \Illuminate\Support\Facades\Http ব্যবহার
        if (class_exists('\\Illuminate\\Support\\Facades\\Http')) {
            try {
                $httpClass = '\\Illuminate\\Support\\Facades\\Http';
                $client = $httpClass::timeout($timeout);
                $res = ($method === 'POST') ? $client->post($url, $data ?? []) : $client->get($url);
                if ($res->successful()) {
                    return $res->json();
                }
            } catch (\Throwable $e) {}
        }

        // ২. নেটিভ PHP cURL ফলব্যাক (যেকোনো PHP / cPanel হোস্টিংয়ে সবসময় কাজ করে)
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);

            if ($method === 'POST') {
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_HTTPHEADER, [
                    'Content-Type: application/json',
                    'Accept: application/json'
                ]);
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data ?? []));
            } else {
                curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);
            }

            $raw = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($raw !== false && $code >= 200 && $code < 300) {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) {
                    return $decoded;
                }
            }
        }

        return null;
    }
}
