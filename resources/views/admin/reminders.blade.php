@extends('admin.layout')

@section('title', 'স্মার্ট রিমাইন্ডার')
@section('page_title', 'স্মার্ট WhatsApp রিমাইন্ডার')
@section('page_subtitle', 'ব্যবহারকারীভিত্তিক পৃথক ও সময়োপযোগী WhatsApp নোটিফিকেশন নিয়ন্ত্রণ')

@section('content')
<!-- Stats and Action Bar -->
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
    <!-- Filter Tabs & User Selector -->
    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <div style="display: flex; gap: 6px; background: rgba(255,255,255,0.05); padding: 4px; border-radius: 12px; border: 1px solid var(--border-color);">
            <a href="{{ route('admin.reminders.index', ['status' => 'all', 'user_id' => $userFilter ?? '']) }}" 
               class="btn {{ $status === 'all' ? 'btn-primary' : 'btn-secondary' }}" style="padding: 7px 12px; font-size: 12px; border: none;">
                সকল
            </a>
            <a href="{{ route('admin.reminders.index', ['status' => 'pending', 'user_id' => $userFilter ?? '']) }}" 
               class="btn {{ $status === 'pending' ? 'btn-primary' : 'btn-secondary' }}" style="padding: 7px 12px; font-size: 12px; border: none;">
                পেন্ডিং ({{ $pendingCount }})
            </a>
            <a href="{{ route('admin.reminders.index', ['status' => 'sent', 'user_id' => $userFilter ?? '']) }}" 
               class="btn {{ $status === 'sent' ? 'btn-primary' : 'btn-secondary' }}" style="padding: 7px 12px; font-size: 12px; border: none;">
                সম্পন্ন ({{ $sentCount }})
            </a>
        </div>

        <!-- User Isolation Filter Dropdown -->
        <select onchange="location.href='{{ route('admin.reminders.index') }}?status={{ $status }}&user_id=' + this.value" 
                style="background: rgba(17, 24, 39, 0.85); border: 1px solid var(--border-color); border-radius: 10px; padding: 8px 14px; color: #fff; font-size: 12px; outline: none; cursor: pointer;">
            <option value="">👤 সকল ইউজার (All Users)</option>
            @foreach($users as $u)
                <option value="{{ $u->username }}" {{ ($userFilter ?? '') == $u->username || ($userFilter ?? '') == $u->id ? 'selected' : '' }}>
                    {{ $u->display_name ?: $u->username }} (@{{ $u->username }})
                </option>
            @endforeach
        </select>

        @if(!empty($userFilter))
            <a href="{{ route('admin.reminders.index', ['status' => $status]) }}" class="btn btn-secondary" style="padding: 7px 12px; font-size: 11px;">
                ফিল্টার মুছুন
            </a>
        @endif
    </div>

    <!-- Quick Dispatch & Add Reminder -->
    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <form method="POST" action="{{ route('admin.reminders.dispatch') }}">
            @csrf
            <button type="submit" class="btn btn-secondary" style="border-color: var(--accent-amber); color: var(--accent-amber);">
                <span>🚀</span>
                <span>ডিউ রিমাইন্ডার পাঠান ({{ $dueCount }})</span>
            </button>
        </form>

        <button class="btn btn-primary" onclick="document.getElementById('newReminderModal').style.display='flex'">
            <span>➕</span>
            <span>নতুন রিমাইন্ডার</span>
        </button>
    </div>
</div>

@if(!empty($userFilter))
    <div style="margin-bottom: 20px; padding: 12px 18px; border-radius: 12px; background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.3); font-size: 13px; color: var(--accent-cyan); display: flex; align-items: center; justify-content: space-between;">
        <span>🔒 শুধুমাত্র ব্যবহারকারী <strong>{{ $userFilter }}</strong>-এর জন্য নির্ধারিত রিমাইন্ডার দেখানো হচ্ছে। এই রিমাইন্ডার অন্য কারো কাছে যাবে না।</span>
        <a href="{{ route('admin.reminders.index', ['status' => $status]) }}" style="color: #fff; text-decoration: underline; font-size: 12px;">ফিল্টার রিসেট করুন</a>
    </div>
@endif

<!-- Reminders Table -->
<div class="card" style="padding: 0; overflow: hidden;">
    <div class="card-header" style="margin: 0; padding: 18px 24px; border-bottom: 1px solid var(--border-color);">
        <div class="card-title">
            <span>⏰</span>
            <span>নির্ধারিত রিমাইন্ডার তালিকা</span>
        </div>
        <span style="font-size: 12px; color: var(--text-muted);">মোট {{ $reminders->total() }}টি রেকর্ড (কঠোরভাবে ইউজারভিত্তিক পৃথকীকৃত)</span>
    </div>

    @if($reminders->count() > 0)
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); background: rgba(255,255,255,0.02);">
                        <th style="padding: 14px 18px;">#</th>
                        <th style="padding: 14px 18px;">কাজের বিবরণ (Reminder)</th>
                        <th style="padding: 14px 18px;">প্রাপক ইউজার (WhatsApp)</th>
                        <th style="padding: 14px 18px;">নির্ধারিত সময় (Remind At)</th>
                        <th style="padding: 14px 18px;">স্ট্যাটাস</th>
                        <th style="padding: 14px 18px; text-align: right;">অ্যাকশন</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach($reminders as $rem)
                        <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
                            <td style="padding: 14px 18px; color: var(--text-muted);">{{ $rem->id }}</td>
                            <td style="padding: 14px 18px; font-weight: 600; color: #ffffff;">
                                {{ $rem->content }}
                            </td>
                            <td style="padding: 14px 18px;">
                                <a href="{{ route('admin.reminders.index', ['user_id' => $rem->user_id]) }}" 
                                   style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; background: rgba(6, 182, 212, 0.12); color: var(--accent-cyan); padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;" 
                                   title="শুধুমাত্র এই ইউজারের রিমাইন্ডার দেখুন">
                                    <span>👤</span>
                                    <code>{{ $rem->user_id }}</code>
                                </a>
                            </td>
                            <td style="padding: 14px 18px; color: var(--accent-cyan);">
                                {{ $rem->remind_at->format('d M, Y — h:i A') }}
                                @if($rem->remind_at->isPast() && $rem->status === 'PENDING')
                                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--accent-rose); margin-left: 4px;" title="ডিউ হয়ে গেছে"></span>
                                @endif
                            </td>
                            <td style="padding: 14px 18px;">
                                @if($rem->status === 'SENT')
                                    <span style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;">
                                        ✅ পাঠানো হয়েছে
                                    </span>
                                @elseif($rem->status === 'PENDING')
                                    <span style="background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;">
                                        ⏳ অপেক্ষমান
                                    </span>
                                @else
                                    <span style="background: rgba(244, 63, 94, 0.15); color: var(--accent-rose); padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;">
                                        ❌ ব্যর্থ
                                    </span>
                                @endif
                            </td>
                            <td style="padding: 14px 18px; text-align: right;">
                                <div style="display: inline-flex; gap: 8px;">
                                    @if($rem->status === 'PENDING')
                                        <form method="POST" action="{{ route('admin.reminders.snooze', $rem->id) }}">
                                            @csrf
                                            <button type="submit" class="btn btn-secondary" style="padding: 5px 12px; font-size: 11px;" title="১৫ মিনিট পিছিয়ে দিন">
                                                💤 স্নুজ
                                            </button>
                                        </form>
                                    @endif
                                    <form method="POST" action="{{ route('admin.reminders.destroy', $rem->id) }}" onsubmit="return confirm('রিমাইন্ডারটি মুছতে চান?')">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit" class="btn btn-danger" style="padding: 5px 12px; font-size: 11px;" title="ডিলিট">
                                            🗑️
                                        </button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    @else
        <div style="text-align: center; padding: 60px 20px;">
            <div style="font-size: 48px; margin-bottom: 12px;">⏰</div>
            <p style="font-size: 16px; color: #fff; font-weight: 600;">কোনো রিমাইন্ডার পাওয়া যায়নি</p>
            <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">WhatsApp-এ লিখুন: <code>রিমাইন্ডার: কাল সকাল ১০টায় মিটিং</code> অথবা উপরের বাটন দিয়ে যুক্ত করুন।</p>
        </div>
    @endif
</div>

<div style="margin-top: 24px;">
    {{ $reminders->links() }}
</div>

<!-- Modal: New Reminder -->
<div id="newReminderModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); z-index: 100; align-items: center; justify-content: center; padding: 20px;">
    <div class="card" style="width: 100%; max-width: 520px; background: #0f172a;">
        <div class="card-header">
            <div class="card-title">⏰ নতুন রিমাইন্ডার সেট করুন</div>
            <button onclick="document.getElementById('newReminderModal').style.display='none'" style="background: none; border: none; color: #fff; font-size: 18px; cursor: pointer;">✕</button>
        </div>
        <form method="POST" action="{{ route('admin.reminders.store') }}">
            @csrf
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">প্রাপক ব্যবহারকারী (User / Phone) *</label>
                <select name="user_id" required style="width: 100%; background: rgba(17, 24, 39, 0.9); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px; color: #fff; font-size: 13px; outline: none;">
                    @foreach($users as $u)
                        <option value="{{ $u->username }}">
                            {{ $u->display_name ?: $u->username }} (@{{ $u->username }}) — {{ $u->bound_phone ?: 'ফোন আনবাইন্ড' }}
                        </option>
                    @endforeach
                </select>
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">রিমাইন্ডারের বিষয়বস্তু *</label>
                <input type="text" name="content" required placeholder="যেমন: ক্লায়েন্ট মিটিং ও প্রেজেন্টেশন" 
                       style="width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px; color: #fff; font-size: 13px; outline: none;">
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">নির্ধারিত সময় (Remind At) *</label>
                <input type="datetime-local" name="remind_at" required 
                       style="width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px; color: #fff; font-size: 13px; outline: none;">
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('newReminderModal').style.display='none'">বাতিল</button>
                <button type="submit" class="btn btn-primary">সেট করুন</button>
            </div>
        </form>
    </div>
</div>
@endsection
