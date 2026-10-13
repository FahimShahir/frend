@extends('admin.layout')

@section('title', 'মাইগ্রেশন ও ডেটাবেস কন্ট্রোল')
@section('page_title', 'মাইগ্রেশন ও ডেটাবেস কন্ট্রোল সেন্টার')
@section('page_subtitle', 'cPanel শেয়ার্ড হোস্টিংয়ে SSH টার্মিনাল ছাড়াই ব্রাউজার থেকে সরাসরি ডেটাবেস মাইগ্রেশন ও SQL ইমপোর্ট')

@section('content')
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 24px;">
    <!-- DB Connection Status Card -->
    <div class="card" style="margin-bottom: 0;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <span style="font-size: 13px; color: var(--text-muted); font-weight: 500;">MySQL সংযোগ স্ট্যাটাস</span>
            <span style="font-size: 20px;">🗄️</span>
        </div>
        <div style="font-size: 22px; font-weight: 700; color: {{ $dbConnected ? 'var(--accent-emerald)' : 'var(--accent-rose)' }};">
            {{ $dbConnected ? 'সংযুক্ত (Connected)' : 'বিচ্ছিন্ন (Failed)' }}
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
            {{ $dbConnected ? 'ড্রাইভার: MySQL (utf8mb4)' : ($dbError ?: 'সংযোগ করা যায়নি') }}
        </p>
    </div>

    <!-- Total Tables Card -->
    <div class="card" style="margin-bottom: 0;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <span style="font-size: 13px; color: var(--text-muted); font-weight: 500;">মোট টেবিল সংখ্যা</span>
            <span style="font-size: 20px;">📊</span>
        </div>
        <div style="font-size: 22px; font-weight: 700; color: var(--accent-cyan);">
            {{ count($tables) }}টি টেবিল
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
            নোট, রিমাইন্ডার, ইউজার ও গ্যামিফিকেশন
        </p>
    </div>

    <!-- Ready for cPanel Card -->
    <div class="card" style="margin-bottom: 0;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <span style="font-size: 13px; color: var(--text-muted); font-weight: 500;">হোস্টিং এনভায়রনমেন্ট</span>
            <span style="font-size: 20px;">🌐</span>
        </div>
        <div style="font-size: 22px; font-weight: 700; color: var(--accent-amber);">
            cPanel Shared Hosting
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">
            Node.js ছাড়া ১০০% নেটিভ PHP ও MySQL
        </p>
    </div>
</div>

<!-- Action Control Center -->
<div class="card">
    <div class="card-header">
        <div class="card-title">
            <span>⚡</span>
            <span>১-ক্লিকে ডেটাবেস অপারেশন (টার্মিনাল ছাড়া)</span>
        </div>
        <span style="font-size: 12px; color: var(--text-muted);">যেকোনো বাটনে ক্লিক করলেই স্বয়ংক্রিয়ভাবে এক্সিকিউট হবে</span>
    </div>

    <div style="display: flex; flex-wrap: wrap; gap: 12px;">
        <button type="button" class="btn btn-primary" onclick="runAction('{{ route('admin.migrations.run') }}', 'মাইগ্রেশন রান হচ্ছে...')">
            <span>🚀</span>
            <span>মাইগ্রেশন রান করুন (php artisan migrate)</span>
        </button>

        <button type="button" class="btn btn-secondary" onclick="runAction('{{ route('admin.migrations.import-sql') }}', 'SQL ফাইল ইমপোর্ট হচ্ছে...')">
            <span>📥</span>
            <span>সরাসরি SQL ডাম্প ইমপোর্ট করুন (frend_complete_mysql.sql)</span>
        </button>

        <button type="button" class="btn btn-secondary" onclick="runAction('{{ route('admin.migrations.clear-cache') }}', 'ক্যাশ ক্লিয়ার হচ্ছে...')">
            <span>⚡</span>
            <span>সিস্টেম অপটিমাইজ ও ক্যাশ ক্লিয়ার</span>
        </button>

        <button type="button" class="btn btn-danger" onclick="if(confirm('আপনি কি নিশ্চিত যে সর্বশেষ মাইগ্রেশন রোলব্যাক করতে চান?')) runAction('{{ route('admin.migrations.rollback') }}', 'রোলব্যাক হচ্ছে...')">
            <span>↩️</span>
            <span>রোলব্যাক (Rollback)</span>
        </button>
    </div>

    <!-- Live Execution Terminal Console -->
    <div style="margin-top: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 13px; font-weight: 600; color: var(--text-muted);">🖥️ লাইভ এক্সিকিউশন কনসোল (Live Artisan Output):</span>
            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="document.getElementById('terminalBox').innerText = 'কনসোল পরিষ্কার করা হয়েছে।'">মুছে ফেলুন</button>
        </div>
        <pre id="terminalBox" style="background: #05080e; border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; font-family: 'Courier New', monospace; font-size: 13px; color: #34d399; min-height: 120px; max-height: 280px; overflow-y: auto; white-space: pre-wrap;">{{ $migrationStatus ?: 'অপারেশন শুরু করতে উপরের যেকোনো বাটনে ক্লিক করুন।' }}</pre>
    </div>
</div>

<!-- MySQL Tables List -->
<div class="card">
    <div class="card-header">
        <div class="card-title">
            <span>📋</span>
            <span>MySQL ডেটাবেস টেবিলসমূহ ও ডেটা রেকর্ড</span>
        </div>
        <span style="font-size: 12px; color: var(--text-muted);">ক্লিক করে রিলোড করতে পারেন</span>
    </div>

    @if(count($tables) > 0)
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                        <th style="padding: 12px 16px;">#</th>
                        <th style="padding: 12px 16px;">টেবিল নাম (Table Name)</th>
                        <th style="padding: 12px 16px;">মোট রেকর্ড (Rows)</th>
                        <th style="padding: 12px 16px;">স্ট্যাটাস</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach($tables as $idx => $tbl)
                        <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
                            <td style="padding: 12px 16px; color: var(--text-muted);">{{ $idx + 1 }}</td>
                            <td style="padding: 12px 16px; font-weight: 600; color: #ffffff;">
                                <code style="background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 6px;">{{ $tbl['name'] }}</code>
                            </td>
                            <td style="padding: 12px 16px; color: var(--accent-cyan); font-weight: 600;">
                                {{ number_format($tbl['rows']) }}
                            </td>
                            <td style="padding: 12px 16px;">
                                <span style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald); padding: 4px 10px; border-radius: 8px; font-size: 11px; font-weight: 600;">
                                    সক্রিয় (Active)
                                </span>
                            </td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    @else
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
            <div style="font-size: 40px; margin-bottom: 12px;">📭</div>
            <p>ডেটাবেসে এখনো কোনো টেবিল তৈরি করা হয়নি।</p>
            <p style="font-size: 12px; margin-top: 6px;">উপরে <strong>"মাইগ্রেশন রান করুন"</strong> বা <strong>"সরাসরি SQL ডাম্প ইমপোর্ট করুন"</strong> বাটনে ক্লিক করলেই টেবিল তৈরি হয়ে যাবে!</p>
        </div>
    @endif
</div>

<!-- cPanel Cron Setup Guide -->
<div class="card" style="border-color: rgba(245, 158, 11, 0.3); background: rgba(245, 158, 11, 0.04);">
    <div class="card-header" style="border-color: rgba(245, 158, 11, 0.2);">
        <div class="card-title" style="color: var(--accent-amber);">
            <span>⏰</span>
            <span>cPanel শেয়ার্ড হোস্টিংয়ে রিমাইন্ডার পাঠানোর ক্রনজব (Cron Job) সেটআপ</span>
        </div>
    </div>
    <p style="font-size: 13px; color: #d1d5db; line-height: 1.6; margin-bottom: 12px;">
        যেহেতু শেয়ার্ড হোস্টিংয়ে Node.js বা অলওয়েজ-অন ব্যাকগ্রাউন্ড ডেমন চলে না, তাই নির্দিষ্ট সময়ে স্বয়ংক্রিয়ভাবে রিমাইন্ডার পাঠাতে cPanel-এর <strong>Cron Jobs</strong>-এ নিচের কমান্ডটি প্রতি ১ মিনিট বা ৫ মিনিট পরপর রান করার জন্য যুক্ত করে দিন:
    </p>
    <div style="background: #000000; padding: 12px 16px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.1); font-family: monospace; font-size: 13px; color: #38bdf8; display: flex; justify-content: space-between; align-items: center;">
        <code>curl -s {{ url('/cron/reminders/process') }} > /dev/null 2>&1</code>
        <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="navigator.clipboard.writeText('curl -s {{ url('/cron/reminders/process') }} > /dev/null 2>&1'); alert('কমান্ড কপি করা হয়েছে!');">কপি করুন</button>
    </div>
</div>
@endsection

@section('scripts')
<script>
    async function runAction(url, pendingText) {
        const box = document.getElementById('terminalBox');
        box.innerText = `⏳ ${pendingText}\nঅনুগ্রহ করে অপেক্ষা করুন...`;

        try {
            const token = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': token
                }
            });

            const data = await res.json();
            box.innerText = `${data.message}\n\n[Console Output]:\n${data.output || 'কোনো আউটপুট নেই।'}`;

            if (data.success) {
                setTimeout(() => {
                    window.location.reload();
                }, 2500);
            }
        } catch (err) {
            box.innerText = `❌ রিকোয়েস্টে ত্রুটি:\n${err.message}`;
        }
    }
</script>
@endsection
