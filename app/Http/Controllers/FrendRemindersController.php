<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Reminder;
use App\Services\ReminderDispatchService;
use Carbon\Carbon;

class FrendRemindersController extends Controller
{
    protected ReminderDispatchService $dispatcher;

    public function __construct(ReminderDispatchService $dispatcher)
    {
        $this->dispatcher = $dispatcher;
    }

    /**
     * রিমাইন্ডার তালিকা ও ফিল্টার
     */
    public function index(Request $request)
    {
        $status = $request->query('status', 'all');
        $query = Reminder::query()->latest('remind_at');

        if ($status === 'pending') {
            $query->where('status', 'PENDING');
        } elseif ($status === 'sent') {
            $query->where('status', 'SENT');
        } elseif ($status === 'failed') {
            $query->where('status', 'FAILED');
        }

        $reminders = $query->paginate(20);
        $pendingCount = Reminder::where('status', 'PENDING')->count();
        $sentCount = Reminder::where('status', 'SENT')->count();
        $dueCount = Reminder::due()->count();

        return view('admin.reminders', compact('reminders', 'status', 'pendingCount', 'sentCount', 'dueCount'));
    }

    /**
     * ম্যানুয়ালি নতুন রিমাইন্ডার তৈরি
     */
    public function store(Request $request)
    {
        $request->validate([
            'content' => 'required|string',
            'remind_at' => 'required|date',
            'user_id' => 'required|string',
        ]);

        Reminder::create([
            'user_id' => $request->input('user_id'),
            'content' => $request->input('content'),
            'remind_at' => Carbon::parse($request->input('remind_at')),
            'status' => 'PENDING',
            'is_sent' => false,
        ]);

        return redirect()->back()->with('success', 'নতুন রিমাইন্ডার যুক্ত হয়েছে!');
    }

    /**
     * ডিউ (Due) রিমাইন্ডারগুলো এখনই WhatsApp-এ পাঠিয়ে দেওয়া
     */
    public function triggerDispatch()
    {
        $res = $this->dispatcher->dispatchDueReminders();
        $msg = "প্রসেস সম্পন্ন: {$res['success']}টি পাঠানো হয়েছে, {$res['failed']}টি ব্যর্থ।";
        return redirect()->back()->with($res['failed'] > 0 ? 'warning' : 'success', $msg);
    }

    /**
     * ১৫ মিনিট স্নুজ করা
     * @param int|string $id
     */
    public function snooze($id)
    {
        $reminder = Reminder::findOrFail($id);
        $reminder->snooze(15);
        return redirect()->back()->with('success', 'রিমাইন্ডারটি ১৫ মিনিটের জন্য স্নুজ করা হয়েছে।');
    }

    /**
     * ডিলিট
     * @param int|string $id
     */
    public function destroy($id)
    {
        $reminder = Reminder::findOrFail($id);
        $reminder->delete();
        return redirect()->back()->with('success', 'রিমাইন্ডার ডিলিট করা হয়েছে।');
    }
}
