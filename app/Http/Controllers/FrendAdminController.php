<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\FrendWhatsAppService;

class FrendAdminController extends Controller
{
    protected FrendWhatsAppService $botService;

    public function __construct(FrendWhatsAppService $botService)
    {
        $this->botService = $botService;
    }

    /**
     * WhatsApp কন্ট্রোল সেন্টার ড্যাশবোর্ড পেজ প্রদর্শন
     */
    public function index()
    {
        $status = $this->botService->getStatus();
        return view('admin.whatsapp', compact('status'));
    }

    /**
     * লাইভ স্ট্যাটাস ও QR কোড AJAX API (প্রতি ২ সেকেন্ড পর পর ব্রাউজার কল করে)
     */
    public function status()
    {
        return response()->json($this->botService->getStatus());
    }

    /**
     * UI থেকে সরাসরি Node.js বট চালু করা (npm start)
     */
    public function start()
    {
        $result = $this->botService->startBotProcess();
        return response()->json($result);
    }

    /**
     * বট রিস্টার্ট করা
     */
    public function restart()
    {
        $result = $this->botService->restartBot();
        return response()->json($result);
    }

    /**
     * WhatsApp সংযোগ বিচ্ছিন্ন / লগআউট করা
     */
    public function logout()
    {
        $result = $this->botService->logoutBot();
        return response()->json($result);
    }

    /**
     * অ্যাডমিন থেকে সরাসরি WhatsApp বার্তা পাঠানো
     */
    public function sendMessage(Request $request)
    {
        $request->validate([
            'phone' => 'required|string',
            'message' => 'required|string',
        ]);

        $result = $this->botService->sendMessage($request->phone, $request->message);
        return response()->json($result);
    }
}
