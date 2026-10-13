@extends('admin.layout')

@section('title', 'নোট মেমোরি')
@section('page_title', 'নোট ও মেমোরি স্টোরেজ')
@section('page_subtitle', 'হোয়াটসঅ্যাপ ও ওয়েব থেকে সংরক্ষিত সকল ব্যক্তিগত নোট ও তথ্যাদি')

@section('content')
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
    <!-- Search Form -->
    <form method="GET" action="{{ route('admin.notes.index') }}" style="display: flex; gap: 8px; flex-grow: 1; max-width: 450px;">
        <input type="text" name="q" value="{{ $search ?? '' }}" placeholder="নোট বা ট্যাগ দিয়ে খুঁজুন..." 
               style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 13px; flex-grow: 1; outline: none;">
        <button type="submit" class="btn btn-secondary">🔍 খুঁজুন</button>
        @if(!empty($search))
            <a href="{{ route('admin.notes.index') }}" class="btn btn-secondary">রিসেট</a>
        @endif
    </form>

    <!-- Create Button -->
    <button class="btn btn-primary" onclick="document.getElementById('newNoteModal').style.display='flex'">
        <span>➕</span>
        <span>নতুন নোট লিখুন</span>
    </button>
</div>

<!-- Notes Grid -->
<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px;">
    @forelse($notes as $note)
        <div class="card" style="margin-bottom: 0; display: flex; flex-direction: column; justify-content: space-between; position: relative;">
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-size: 11px; color: var(--text-muted); background: rgba(255,255,255,0.06); padding: 3px 8px; border-radius: 6px;">
                        #{{ $note->id }} · {{ $note->created_at->format('d M, Y') }}
                    </span>
                    <div style="display: flex; gap: 6px;">
                        <form method="POST" action="{{ route('admin.notes.pin', $note->id) }}">
                            @csrf
                            <button type="submit" style="background: none; border: none; cursor: pointer; font-size: 16px;" title="{{ $note->is_pinned ? 'আনপিন করুন' : 'পিন করুন' }}">
                                {{ $note->is_pinned ? '📌' : '📍' }}
                            </button>
                        </form>
                        <form method="POST" action="{{ route('admin.notes.destroy', $note->id) }}" onsubmit="return confirm('নোটটি ডিলিট করতে চান?')">
                            @csrf
                            @method('DELETE')
                            <button type="submit" style="background: none; border: none; cursor: pointer; font-size: 16px; color: var(--accent-rose);" title="ডিলিট">
                                🗑️
                            </button>
                        </form>
                    </div>
                </div>

                <p style="font-size: 14px; line-height: 1.6; color: #f3f4f6; white-space: pre-wrap; margin-bottom: 14px;">{{ $note->content }}</p>
            </div>

            <div>
                @if(!empty($note->tags))
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
                        @foreach(explode(',', $note->tags) as $tg)
                            @if(trim($tg))
                                <span style="font-size: 11px; background: rgba(6, 182, 212, 0.12); color: var(--accent-cyan); padding: 2px 8px; border-radius: 6px;">
                                    #{{ trim($tg) }}
                                </span>
                            @endif
                        @endforeach
                    </div>
                @endif
                <div style="font-size: 11px; color: var(--text-muted);">
                    ব্যবহারকারী: <code>{{ $note->user_id }}</code>
                </div>
            </div>
        </div>
    @empty
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
            <div style="font-size: 48px; margin-bottom: 12px;">📝</div>
            <p style="font-size: 16px; color: #fff; font-weight: 600;">কোনো নোট পাওয়া যায়নি</p>
            <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">WhatsApp-এ লিখুন: <code>নোট: আমার বাজার ফর্দ</code> অথবা উপরের বাটন দিয়ে তৈরি করুন।</p>
        </div>
    @endforelse
</div>

<div style="margin-top: 24px;">
    {{ $notes->links() }}
</div>

<!-- Modal: New Note -->
<div id="newNoteModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index: 100; align-items: center; justify-content: center; padding: 20px;">
    <div class="card" style="width: 100%; max-width: 520px; background: #0f172a;">
        <div class="card-header">
            <div class="card-title">📝 নতুন নোট তৈরি করুন</div>
            <button onclick="document.getElementById('newNoteModal').style.display='none'" style="background: none; border: none; color: #fff; font-size: 18px; cursor: pointer;">✕</button>
        </div>
        <form method="POST" action="{{ route('admin.notes.store') }}">
            @csrf
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">নোটের বিষয়বস্তু</label>
                <textarea name="content" rows="4" required placeholder="কী মনে রাখতে চান..." 
                          style="width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 10px; padding: 12px; color: #fff; font-size: 14px; outline: none;"></textarea>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">ট্যাগ (কমা দিয়ে আলাদা করুন)</label>
                <input type="text" name="tags" placeholder="urgent, shopping, office" 
                       style="width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px; color: #fff; font-size: 13px; outline: none;">
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('newNoteModal').style.display='none'">বাতিল</button>
                <button type="submit" class="btn btn-primary">সংরক্ষণ করুন</button>
            </div>
        </form>
    </div>
</div>
@endsection
