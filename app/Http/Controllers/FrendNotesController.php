<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Note;

class FrendNotesController extends Controller
{
    /**
     * সকল নোটের তালিকা ও ফিল্টার
     */
    public function index(Request $request)
    {
        $search = $request->query('q');
        $tag = $request->query('tag');

        $query = Note::query()->orderBy('is_pinned', 'desc')->latest();

        if ($search) {
            $query->search($search);
        }

        if ($tag) {
            $query->where('tags', 'like', "%{$tag}%");
        }

        $notes = $query->paginate(15);
        $totalNotes = Note::count();

        return view('admin.notes', compact('notes', 'search', 'tag', 'totalNotes'));
    }

    /**
     * নতুন নোট তৈরি
     */
    public function store(Request $request)
    {
        $request->validate([
            'content' => 'required|string',
            'user_id' => 'nullable|string',
            'tags' => 'nullable|string',
        ]);

        Note::create([
            'user_id' => $request->input('user_id') ?: 'admin',
            'content' => $request->input('content'),
            'tags' => $request->input('tags', ''),
            'is_pinned' => $request->boolean('is_pinned'),
        ]);

        return redirect()->back()->with('success', 'নোট সফলভাবে সংরক্ষণ করা হয়েছে!');
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
