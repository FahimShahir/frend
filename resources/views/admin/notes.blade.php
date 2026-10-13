@extends('admin.layout')

@section('title', 'নোট মেমোরি')
@section('page_title', 'নোট ও মেমোরি স্টোরেজ')
@section('page_subtitle', 'ব্যবহারকারীভিত্তিক পৃথক ও ব্যক্তিগত নোট মেমোরি কন্ট্রোল')

@section('content')
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
    <!-- Search & User Filter Form -->
    <form method="GET" action="{{ route('admin.notes.index') }}" style="display: flex; gap: 8px; flex-grow: 1; max-width: 650px; flex-wrap: wrap;">
        <input type="text" name="q" value="{{ $search ?? '' }}" placeholder="নোট বা ট্যাগ দিয়ে খুঁজুন..." 
               style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 13px; flex-grow: 1; min-width: 180px; outline: none;">
        
        <!-- User Isolation Filter -->
        <select name="user_id" onchange="this.form.submit()" style="background: rgba(17, 24, 39, 0.85); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 14px; color: #fff; font-size: 13px; outline: none;">
            <option value="">👤 সকল ইউজার (All)</option>
            @foreach($users as $u)
                <option value="{{ $u->username }}" {{ ($userFilter ?? '') == $u->username || ($userFilter ?? '') == $u->id ? 'selected' : '' }}>
                    {{ $u->display_name ?: $u->username }} (@{{ $u->username }})
                </option>
            @endforeach
        </select>

        <button type="submit" class="btn btn-secondary">🔍 ফিল্টার</button>
        @if(!empty($search) || !empty($userFilter) || !empty($tag))
            <a href="{{ route('admin.notes.index') }}" class="btn btn-secondary">রিসেট</a>
        @endif
    </form>

    <!-- Create Button -->
    <button class="btn btn-primary" onclick="document.getElementById('newNoteModal').style.display='flex'">
        <span>➕</span>
        <span>নতুন নোট লিখুন</span>
    </button>
</div>

@if(!empty($userFilter))
    <div style="margin-bottom: 18px; padding: 10px 16px; border-radius: 10px; background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.3); font-size: 13px; color: var(--accent-cyan); display: flex; align-items: center; justify-content: space-between;">
        <span>🔒 শুধুমাত্র ব্যবহারকারী <strong>{{ $userFilter }}</strong>-এর ব্যক্তিগত নোট দেখানো হচ্ছে।</span>
        <a href="{{ route('admin.notes.index') }}" style="color: #fff; text-decoration: underline; font-size: 12px;">সকল নোট দেখুন</a>
    </div>
@endif

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
                <div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 8px;">
                    <span>🔒 স্বত্বাধিকারী:</span>
                    <a href="{{ route('admin.notes.index', ['user_id' => $note->user_id]) }}" style="color: var(--accent-cyan); text-decoration: none; font-weight: 600; background: rgba(6, 182, 212, 0.12); padding: 2px 8px; border-radius: 6px;" title="শুধুমাত্র এই ইউজারের নোট ফিল্টার করুন">
                        👤 {{ $note->user_id }}
                    </a>
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
                <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">কোন ইউজারের অ্যাকাউন্টে নোটটি সংরক্ষিত হবে? *</label>
                <select name="user_id" required style="width: 100%; background: rgba(17, 24, 39, 0.9); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px; color: #fff; font-size: 13px; outline: none;">
                    @foreach($users as $u)
                        <option value="{{ $u->username }}">
                            {{ $u->display_name ?: $u->username }} (@{{ $u->username }})
                        </option>
                    @endforeach
                </select>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">নোটের বিষয়বস্তু *</label>
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
