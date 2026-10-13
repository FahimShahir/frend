<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Note;
use App\Models\BotUser;

class FrendNotesController extends Controller
{
    /**
     * সকল নোটের তালিকা ও ইউজার ফিল্টার
     */
    public function index(Request $request)
    {
        $search = $request->query('q');
        $tag = $request->query('tag');
        $userFilter = $request->query('user_id');

        $query = Note::query()->orderBy('is_pinned', 'desc')->latest();

        if ($userFilter) {
            $botUser = BotUser::find($userFilter) ?? BotUser::where('username', $userFilter)->first();
            if ($botUser) {
                $keys = array_unique(array_filter([
                    $botUser->username,
                    (string)$botUser->id,
                    $botUser->bound_phone,
                    preg_replace('/\D/', '', (string)$botUser->bound_phone),
                ]));
                $query->whereIn('user_id', $keys);
            } else {
                $query->where('user_id', $userFilter);
            }
        }

        if ($search) {
            $query->search($search);
        }

        if ($tag) {
            $query->where('tags', 'like', "%{$tag}%");
        }

        $notes = $query->paginate(15);
        $totalNotes = Note::count();
        $users = BotUser::all();

        return view('admin.notes', compact('notes', 'search', 'tag', 'userFilter', 'users', 'totalNotes'));
    }

    /**
     * নির্দিষ্ট ইউজারের অ্যাকাউন্টে নতুন নোট তৈরি
     */
    public function store(Request $request)
    {
        $request->validate([
            'content' => 'required|string',
            'user_id' => 'required|string',
            'tags' => 'nullable|string',
        ]);

        Note::create([
            'user_id' => $request->input('user_id'),
            'content' => $request->input('content'),
            'tags' => $request->input('tags', ''),
            'is_pinned' => $request->boolean('is_pinned'),
        ]);

        return redirect()->back()->with('success', 'ইউজার ' . $request->input('user_id') . '-এর জন্য নোট সংরক্ষিত হয়েছে!');
    }

    /**
     * নোট ডিলিট
     * @param int|string $id
     */
    public function destroy($id)
    {
        $note = Note::findOrFail($id);
        $note->delete();

        return redirect()->back()->with('success', 'নোট ডিলিট সম্পন্ন হয়েছে।');
    }

    /**
     * পিন টগল
     * @param int|string $id
     */
    public function togglePin($id)
    {
        $note = Note::findOrFail($id);
        $note->is_pinned = !$note->is_pinned;
        $note->save();

        return redirect()->back()->with('success', $note->is_pinned ? 'নোট পিন করা হয়েছে।' : 'নোট আনপিন করা হয়েছে।');
    }
}
