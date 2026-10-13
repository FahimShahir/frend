<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\BotUser;
use App\Models\Plan;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;

class FrendUsersController extends Controller
{
    /**
     * সকল ইউজার তালিকা, পরিসংখ্যান ও ফিল্টারিং
     */
    public function index(Request $request)
    {
        $search = trim($request->input('q', ''));
        $roleFilter = $request->input('role');
        $statusFilter = $request->input('status');
        $planFilter = $request->input('plan');

        $query = BotUser::with(['plan', 'gamification']);

        if (!empty($search)) {
            $query->where(function ($q) use ($search) {
                $q->where('username', 'LIKE', "%{$search}%")
                  ->orWhere('display_name', 'LIKE', "%{$search}%")
                  ->orWhere('bound_phone', 'LIKE', "%{$search}%");
            });
        }

        if (!empty($roleFilter)) {
            $query->where('role', $roleFilter);
        }

        if (!empty($statusFilter)) {
            $query->where('status', $statusFilter);
        }

        if (!empty($planFilter)) {
            $query->where('assigned_plan_id', $planFilter);
        }

        $users = $query->orderBy('id', 'desc')->get();

        // পরিসংখ্যান
        $stats = [
            'total' => BotUser::count(),
            'active' => BotUser::where('status', 'active')->count(),
            'disabled' => BotUser::where('status', 'disabled')->count(),
            'blocked' => BotUser::where('status', 'blocked')->count(),
            'admins' => BotUser::where('role', 'admin')->count(),
            'linked_phone' => BotUser::whereNotNull('bound_phone')->where('bound_phone', '!=', '')->count(),
        ];

        $plans = Plan::all();

        return view('admin.users', compact('users', 'stats', 'plans', 'search', 'roleFilter', 'statusFilter', 'planFilter'));
    }

    /**
     * নতুন ব্যবহারকারী যুক্ত করা
     */
    public function store(Request $request)
    {
        $request->validate([
            'username' => 'required|string|max:100|unique:bot_authorized_users,username',
            'password' => 'required|string|min:3',
            'display_name' => 'nullable|string|max:191',
            'bound_phone' => 'nullable|string|max:100',
            'role' => 'required|in:admin,user',
            'assigned_plan_id' => 'required|string',
            'status' => 'required|in:active,disabled,blocked',
        ]);

        $phone = trim($request->input('bound_phone', ''));
        if (!empty($phone) && !str_contains($phone, '@')) {
            $digits = preg_replace('/\D/', '', $phone);
            $phone = !empty($digits) ? "{$digits}@c.us" : null;
        }

        $user = BotUser::create([
            'username' => strtolower(trim($request->username)),
            'password' => Hash::make($request->password),
            'display_name' => $request->display_name ?: $request->username,
            'bound_phone' => $phone ?: null,
            'role' => $request->role,
            'assigned_plan_id' => $request->assigned_plan_id ?: 'free',
            'status' => $request->status,
        ]);

        return redirect()->route('admin.users.index')
            ->with('success', "নতুন ব্যবহারকারী '{$user->username}' সফলভাবে তৈরি করা হয়েছে!");
    }

    /**
     * ব্যবহারকারীর তথ্য আপডেট করা
     */
    public function update(Request $request, $id)
    {
        $user = BotUser::findOrFail($id);

        $request->validate([
            'display_name' => 'nullable|string|max:191',
            'bound_phone' => 'nullable|string|max:100',
            'role' => 'required|in:admin,user',
            'assigned_plan_id' => 'required|string',
            'status' => 'required|in:active,disabled,blocked',
            'password' => 'nullable|string|min:3',
        ]);

        $phone = trim($request->input('bound_phone', ''));
        if (!empty($phone) && !str_contains($phone, '@')) {
            $digits = preg_replace('/\D/', '', $phone);
            $phone = !empty($digits) ? "{$digits}@c.us" : null;
        }

        $data = [
            'display_name' => $request->display_name ?: $user->username,
            'bound_phone' => $phone ?: null,
            'role' => $request->role,
            'assigned_plan_id' => $request->assigned_plan_id,
            'status' => $request->status,
        ];

        if (!empty($request->password)) {
            $data['password'] = Hash::make($request->password);
        }

        $user->update($data);

        return redirect()->route('admin.users.index')
            ->with('success', "ব্যবহারকারী '{$user->username}'-এর তথ্য সফলভাবে আপডেট হয়েছে!");
    }

    /**
     * দ্রুত স্ট্যাটাস পরিবর্তন (Active / Disabled / Blocked)
     */
    public function updateStatus(Request $request, $id)
    {
        $user = BotUser::findOrFail($id);
        $status = $request->input('status');

        if (!in_array($status, ['active', 'disabled', 'blocked'])) {
            return back()->with('warning', 'অবৈধ স্ট্যাটাস মান!');
        }

        $user->status = $status;
        $user->save();

        if ($request->wantsJson()) {
            return response()->json(['success' => true, 'status' => $status]);
        }

        return back()->with('success', "'{$user->username}'-এর স্ট্যাটাস '{$status}' করা হয়েছে।");
    }

    /**
     * পাসওয়ার্ড রিসেট করা
     */
    public function resetPassword(Request $request, $id)
    {
        $user = BotUser::findOrFail($id);
        $request->validate([
            'password' => 'required|string|min:3',
        ]);

        $user->password = Hash::make($request->password);
        $user->save();

        if ($request->wantsJson()) {
            return response()->json(['success' => true, 'message' => 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!']);
        }

        return back()->with('success', "'{$user->username}'-এর পাসওয়ার্ড সফলভাবে রিসেট করা হয়েছে!");
    }

    /**
     * WhatsApp লিঙ্ক মুছে দেওয়া (Unbind Phone)
     */
    public function unbindPhone($id)
    {
        $user = BotUser::findOrFail($id);
        $user->bound_phone = null;
        $user->save();

        return back()->with('success', "'{$user->username}'-এর WhatsApp লিঙ্ক বিচ্ছিন্ন করা হয়েছে।");
    }

    /**
     * ব্যবহারকারী মুছে ফেলা
     */
    public function destroy($id)
    {
        $user = BotUser::findOrFail($id);

        // শেষ অ্যাডমিন ডিলিট করা রোধ
        if ($user->role === 'admin' && BotUser::where('role', 'admin')->count() <= 1) {
            return back()->with('warning', 'সিস্টেমের একমাত্র অ্যাডমিন অ্যাকাউন্টটি মুছে ফেলা সম্ভব নয়!');
        }

        $username = $user->username;
        $user->delete();

        return redirect()->route('admin.users.index')
            ->with('success', "ব্যবহারকারী '{$username}' স্থায়ীভাবে মুছে ফেলা হয়েছে।");
    }
}
