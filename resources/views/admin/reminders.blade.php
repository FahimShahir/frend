@extends('admin.layout')

@section('title', 'স্মার্ট রিমাইন্ডার')
@section('page_title', 'স্মার্ট WhatsApp রিমাইন্ডার')
@section('page_subtitle', 'নির্দিষ্ট সময়ে স্বয়ংক্রিয়ভাবে WhatsApp-এ নোটিফিকেশন পাঠানোর তালিকা')

@section('content')
<!-- Stats and Action Bar -->
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
    <!-- Filter Tabs -->
    <div style="display: flex; gap: 8px; background: rgba(255,255,255,0.05); padding: 4px; border-radius: 12px; border: 1px solid var(--border-color);">
        <a href="{{ route('admin.reminders.index', ['status' => 'all']) }}" 
           class="btn {{ $status === 'all' ? 'btn-primary' : 'btn-secondary' }}" style="padding: 8px 14px; font-size: 12px; border: none;">
            সকল (All)
        </a>
        <a href="{{ route('admin.reminders.index', ['status' => 'pending']) }}" 
           class="btn {{ $status === 'pending' ? 'btn-primary' : 'btn-secondary' }}" style="padding: 8px 14px; font-size: 12px; border: none;">
            পেন্ডিং ({{ $pendingCount }})
        </a>
        <a href="{{ route('admin.reminders.index', ['status' => 'sent']) }}" 
           class="btn {{ $status === 'sent' ? 'btn-primary' : 'btn-secondary' }}" style="padding: 8px 14px; font-size: 12px; border: none;">
            সম্পন্ন ({{ $sentCount }})
        </a>
    </div>

    <!-- Quick Dispatch & Add Reminder -->
    <div style="display: flex; gap: 10px;">
        <form method="POST" action="{{ route('admin.reminders.dispatch') }}">
            @csrf
            <button type="submit" class="btn btn-secondary" style="border-color: var(--accent-amber); color: var(--accent-amber);">
                <span>🚀</span>
                <span>ডিউ রিমাইন্ডার এখনই পাঠান ({{ $dueCount }})</span>
            </button>
        </form>

        <button class="btn btn-primary" onclick="document.getElementById('newReminderModal').style.display='flex'">
            <span>➕</span>
            <span>নতুন রিমাইন্ডার</span>
        </button>
    </div>
</div>

<!-- Reminders Table -->
<div class="card">
    <div class="card-header">
        <div class="card-title">
            <span>⏰</span>
            <span>নির্ধারিত রিমাইন্ডার তালিকা</span>
        </div>
        <span style="font-size: 12px; color: var(--text-muted);">মোট {{ $reminders->total() }}টি রেকর্ড</span>
    </div>

    @if($reminders->count() > 0)
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                        <th style="padding: 12px 16px;">#</th>
                        <th style="padding: 12px 16px;">কাজের বিবরণ (Reminder)</th>
                        <th style="padding: 12px 16px;">প্রাপক (WhatsApp)</th>
                        <th style="padding: 12px 16px;">নির্ধারিত সময় (Remind At)</th>
                        <th style="padding: 12px 16px;">স্ট্যাটাস</th>
                        <th style="padding: 12px 16px; text-align: right;">অ্যাকশন</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach($reminders as $rem)
                        <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
                            <td style="padding: 12px 16px; color: var(--text-muted);">{{ $rem->id }}</td>
                            <td style="padding: 12px 16px; font-weight: 600; color: #ffffff;">
                                {{ $rem->content }}
                            </td>
                            <td style="padding: 12px 16px;">
                                <code style="background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 6px;">{{ $rem->user_id }}</code>
                            </td>
                            <td style="padding: 12px 16px; color: var(--accent-cyan);">
                                {{ $rem->remind_at->format('d M, Y — h:i A') }}
                                @if($rem->remind_at->isPast() && $rem->status === 'PENDING')
                                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--accent-rose); margin-left: 4px;" title="ডিউ হয়ে গেছে"></span>
                                @endif
                            </td>
                            <td style="padding: 12px 16px;">
                                @if($rem->status === 'SENT')
                                    <span style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">
                                        ✅ পাঠানো হয়েছে
                                    </span>
                                @elseif($rem->status === 'PENDING')
                                    <span style="background: rgba(245, 158, 11, 0.15); color: var(--accent-amber); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">
                                        ⏳ অপেক্ষমান
                                    </span>
                                @else
                                    <span style="background: rgba(244, 63, 94, 0.15); color: var(--accent-rose); padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;">
                                        ❌ ব্যর্থ ({{ $rem->status }})
                                    </span>
                                @endif
                            </td>
                            <td style="padding: 12px 16px; text-align: right;">
                                <div style="display: inline-flex; gap: 8px;">
                                    @if($rem->status === 'PENDING')
                                        <form method="POST" action="{{ route('admin.reminders.snooze', $rem->id) }}">
                                            @csrf
                                            <button type="submit" class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;" title="১৫ মিনিট স্নুজ">
                                                💤 স্নুজ
                                            </button>
                                        </form>
                                    @endif
                                    <form method="POST" action="{{ route('admin.reminders.destroy', $rem->id) }}" onsubmit="return confirm('রিমাইন্ডারটি মুছতে চান?')">
                                        @csrf
                                        @method('DELETE')
                                        <button type="submit" class="btn btn-danger" style="padding: 4px 10px; font-size: 11px;" title="ডিলিট">
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
        <div style="margin-top: 16px;">
            {{ $reminders->links() }}
        </div>
    @else
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
            <div style="font-size: 40px; margin-bottom: 12px;">⏰</div>
            <p>কোনো রিমাইন্ডার পাওয়া যায়নি।</p>
        </div>
    @endif
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
                <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">কাজের বিষয় (Reminder Content)</label>
                <input type="text" name="content" required placeholder="যেমন: ক্লায়েন্টের সাথে মিটিং" 
                       style="width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px; color: #fff; font-size: 14px; outline: none;">
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">প্রাপকের WhatsApp নম্বর</label>
                <input type="text" name="user_id" required placeholder="8801969091751" 
                       style="width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px; color: #fff; font-size: 13px; outline: none;">
            </div>
            <div style="margin-bottom: 16px;">
                <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">তারিখ ও সময়</label>
                <input type="datetime-local" name="remind_at" required 
                       style="width: 100%; background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 10px; padding: 10px; color: #fff; font-size: 13px; outline: none;">
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('newReminderModal').style.display='none'">বাতিল</button>
                <button type="submit" class="btn btn-primary">সেভ করুন</button>
            </div>
        </form>
    </div>
</div>
@endsection
