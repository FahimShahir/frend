<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use App\Services\GeminiAiService;
use App\Services\FrendWhatsAppService;
use Exception;

/**
 * Class FrendSettingsController
 * 
 * cPanel শেয়ার্ড হোস্টিংয়ের জন্য অল-ইন-ওয়ান সিস্টেম কন্ট্রোল:
 * ১. ওয়েব আর্টিসান টার্মিনাল (SSH/Terminal ছাড়া যেকোনো artisan কমান্ড রান করা)
 * ২. .env ফাইল এডিটর (cPanel ফাইল ম্যানেজার ছাড়া সেটিংস ও API Key পরিবর্তন)
 * ৩. সিস্টেম ডায়াগনস্টিক ও স্বাস্থ্য পরীক্ষা
 * ৪. Gemini AI ও WhatsApp গেটওয়ে কানেকশন টেস্ট
 */
class FrendSettingsController extends Controller
{
    protected GeminiAiService $ai;
    protected FrendWhatsAppService $whatsapp;

    public function __construct(GeminiAiService $ai, FrendWhatsAppService $whatsapp)
    {
        $this->ai = $ai;
        $this->whatsapp = $whatsapp;
    }

    /**
     * সেটিংস ও সিস্টেম ম্যানেজমেন্ট পেজ
     */
    public function index()
    {
        $envPath = base_path('.env');
        $envExists = File::exists($envPath);
        $envWritable = $envExists && is_writable($envPath);

        // সিস্টেম ডায়াগনস্টিক
        $diagnostics = [
            'php_version' => PHP_VERSION,
            'laravel_version' => app()->version(),
            'os' => PHP_OS_FAMILY . ' (' . PHP_OS . ')',
            'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'PHP CLI / Built-in',
            'storage_writable' => is_writable(storage_path()),
            'cache_writable' => is_writable(base_path('bootstrap/cache')),
            'env_writable' => $envWritable,
            'pdo_mysql' => extension_loaded('pdo_mysql'),
            'curl' => extension_loaded('curl'),
            'mbstring' => extension_loaded('mbstring'),
            'openssl' => extension_loaded('openssl'),
        ];

        // ডেটাবেস স্ট্যাটাস
        $dbStatus = 'OFFLINE';
        $dbError = null;
        try {
            DB::connection()->getPdo();
            $dbStatus = 'CONNECTED (' . DB::connection()->getDatabaseName() . ')';
        } catch (Exception $e) {
            $dbError = $e->getMessage();
        }

        // বর্তমান কনফিগারেশন
        $config = [
            'app_name' => config('app.name', 'FREND Assistant'),
            'app_url' => config('app.url', 'http://localhost:8000'),
            'app_debug' => config('app.debug', true),
            'db_host' => config('database.connections.mysql.host', '127.0.0.1'),
            'db_port' => config('database.connections.mysql.port', '3306'),
            'db_database' => config('database.connections.mysql.database', 'frend_db'),
            'db_username' => config('database.connections.mysql.username', 'root'),
            'frend_bot_url' => env('FREND_BOT_URL', 'http://127.0.0.1:3000'),
            'frend_bot_path' => env('FREND_BOT_PATH', 'whatsapp_bot_runner'),
            'has_gemini_key' => !empty(env('GEMINI_API_KEY')),
            'gemini_key_masked' => env('GEMINI_API_KEY') ? substr(env('GEMINI_API_KEY'), 0, 8) . '...' . substr(env('GEMINI_API_KEY'), -6) : '',
        ];

        // বটের লাইভ স্ট্যাটাস
        $botStatus = $this->whatsapp->getStatus();

        return view('admin.settings', compact('diagnostics', 'dbStatus', 'dbError', 'config', 'botStatus'));
    }

    /**
     * .env ফাইল নিরাপদভাবে আপডেট করা
     */
    public function update(Request $request)
    {
        $validated = $request->validate([
            'app_name' => 'nullable|string|max:100',
            'app_url' => 'nullable|string|max:255',
            'db_host' => 'nullable|string|max:100',
            'db_port' => 'nullable|string|max:10',
            'db_database' => 'nullable|string|max:100',
            'db_username' => 'nullable|string|max:100',
            'db_password' => 'nullable|string',
            'frend_bot_url' => 'nullable|string|max:255',
            'frend_bot_path' => 'nullable|string|max:255',
            'gemini_api_key' => 'nullable|string|max:255',
        ]);

        $envPath = base_path('.env');
        if (!File::exists($envPath)) {
            return back()->with('warning', '.env ফাইলটি পাওয়া যায়নি।');
        }

        $envContent = File::get($envPath);

        $updates = [
            'APP_NAME' => $validated['app_name'] ? '"' . trim($validated['app_name']) . '"' : null,
            'APP_URL' => $validated['app_url'] ? trim($validated['app_url']) : null,
            'DB_HOST' => $validated['db_host'] ? trim($validated['db_host']) : null,
            'DB_PORT' => $validated['db_port'] ? trim($validated['db_port']) : null,
            'DB_DATABASE' => $validated['db_database'] ? trim($validated['db_database']) : null,
            'DB_USERNAME' => $validated['db_username'] ? trim($validated['db_username']) : null,
            'FREND_BOT_URL' => $validated['frend_bot_url'] ? trim($validated['frend_bot_url']) : null,
            'FREND_BOT_PATH' => $validated['frend_bot_path'] ? trim($validated['frend_bot_path']) : null,
        ];

        // পাসওয়ার্ড দেওয়া থাকলে আপডেট হবে
        if ($request->filled('db_password')) {
            $updates['DB_PASSWORD'] = trim($request->input('db_password'));
        }

        // Gemini API Key দেওয়া থাকলে আপডেট হবে
        if ($request->filled('gemini_api_key')) {
            $updates['GEMINI_API_KEY'] = trim($request->input('gemini_api_key'));
        }

        foreach ($updates as $key => $val) {
            if ($val === null) continue;
            if (preg_match("/^{$key}=.*/m", $envContent)) {
                $envContent = preg_replace("/^{$key}=.*/m", "{$key}={$val}", $envContent);
            } else {
                $envContent .= "\n{$key}={$val}";
            }
        }

        File::put($envPath, $envContent);

        // বট রানার ফোল্ডারের .env ও সিঙ্ক করি
        $botEnv = base_path('whatsapp_bot_runner/.env');
        if (File::exists(base_path('whatsapp_bot_runner'))) {
            File::put($botEnv, $envContent);
        }

        // কনফিগ ক্যাশ ক্লিয়ার
        try {
            Artisan::call('config:clear');
        } catch (Exception $e) {}

        return back()->with('success', '🎉 সিস্টেম সেটিংস সফলভাবে আপডেট ও সংরক্ষিত হয়েছে!');
    }

    /**
     * ব্রাউজার থেকে সরাসরি যেকোনো Artisan কমান্ড রান করা (Web Terminal)
     */
    public function runArtisan(Request $request)
    {
        $command = trim($request->input('command', ''));

        if (empty($command)) {
            return response()->json(['success' => false, 'message' => 'কমান্ড খালি হতে পারে না।']);
        }

        // নিরাপত্তা: বিপজ্জনক শেল কমান্ড ব্লক
        $blocked = ['tinker', 'serve', 'down', 'pail'];
        $firstWord = explode(' ', $command)[0];
        if (in_array(strtolower($firstWord), $blocked)) {
            return response()->json([
                'success' => false,
                'message' => "কমান্ড '{$firstWord}' ওয়েব কনসোল থেকে চালানো অনুমোদিত নয়।"
            ]);
        }

        try {
            $exitCode = Artisan::call($command);
            $output = Artisan::output();

            return response()->json([
                'success' => $exitCode === 0,
                'command' => $command,
                'output' => !empty($output) ? $output : "কমান্ড সফলভাবে এক্সিকিউট হয়েছে (Exit Code: {$exitCode})।",
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'command' => $command,
                'output' => 'ত্রুটি: ' . $e->getMessage(),
            ]);
        }
    }

    /**
     * Gemini AI কানেকশন লাইভ টেস্ট
     */
    public function testGemini(Request $request)
    {
        $key = $request->input('api_key') ?: env('GEMINI_API_KEY');

        if (empty($key)) {
            return response()->json([
                'success' => false,
                'message' => 'কোনো Gemini API Key কনফিগার করা নেই।'
            ]);
        }

        try {
            $url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" . urlencode($key);
            $response = Http::timeout(6)->post($url, [
                'contents' => [
                    ['parts' => [['text' => 'Say OK in Bengali']]]
                ]
            ]);

            if ($response->successful()) {
                $data = $response->json();
                $reply = $data['candidates'][0]['content']['parts'][0]['text'] ?? 'ঠিক আছে';
                return response()->json([
                    'success' => true,
                    'message' => '✅ Gemini AI সফলভাবে কানেক্টেড! রেসপন্স: ' . trim($reply)
                ]);
            }

            $errorData = $response->json();
            $msg = $errorData['error']['message'] ?? $response->body();
            return response()->json([
                'success' => false,
                'message' => '❌ Gemini কানেকশন ব্যর্থ: ' . $msg
            ]);
        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'কানেকশন টেস্টে সমস্যা: ' . $e->getMessage()
            ]);
        }
    }

    /**
     * WhatsApp বট গেটওয়ে লাইভ টেস্ট
     */
    public function testBot(Request $request)
    {
        $status = $this->whatsapp->getStatus();
        return response()->json($status);
    }
}
