@extends('admin.layout')

@section('title', 'WhatsApp কন্ট্রোল হাব')
@section('page_title', 'WhatsApp লাইভ কন্ট্রোল হাব')
@section('page_subtitle', 'সরাসরি ব্রাউজার থেকে WhatsApp কিউআর স্ক্যান, লাইভ সংযোগ ও স্বয়ংক্রিয় মেসেজিং নিয়ন্ত্রণ')

@section('styles')
<style>
    .action-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: flex-end;
        margin-bottom: 20px;
    }
    .qr-container-grid {
        display: grid;
        grid-template-columns: 1fr 340px;
        gap: 28px;
        align-items: center;
    }
    @media (max-width: 900px) {
        .qr-container-grid {
            grid-template-columns: 1fr;
        }
    }
    .qr-white-box {
        background: #ffffff;
        padding: 20px;
        border-radius: 16px;
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 300px;
        text-align: center;
    }
    .qr-white-box img {
        width: 250px;
        height: 250px;
        border-radius: 10px;
        display: block;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .step-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
        margin: 18px 0;
    }
    .step-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        font-size: 14px;
        color: #d1d5db;
        line-height: 1.5;
    }
    .step-num {
        background: rgba(6, 182, 212, 0.15);
        color: var(--accent-cyan);
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 13px;
        flex-shrink: 0;
        border: 1px solid rgba(6, 182, 212, 0.3);
    }
    .connected-hero-card {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.08));
        border: 1px solid rgba(16, 185, 129, 0.35);
        border-radius: 16px;
        padding: 24px;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
    }
    .hero-meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 14px;
        margin: 16px 0;
    }
    .meta-box {
        background: rgba(13, 18, 30, 0.6);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 12px 14px;
    }
    .meta-box-label {
        font-size: 11px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
    }
    .meta-box-val {
        font-size: 15px;
        font-weight: 700;
        color: #fff;
    }
    .form-row {
        display: grid;
        grid-template-columns: 200px 1fr auto;
        gap: 12px;
        align-items: center;
    }
    @media (max-width: 768px) {
        .form-row {
            grid-template-columns: 1fr;
        }
    }
    .form-input {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 12px 14px;
        color: #fff;
        font-size: 13px;
        outline: none;
        width: 100%;
        transition: border-color 0.2s;
    }
    .form-input:focus {
        border-color: var(--border-focus);
    }
    .spinner-sm {
        width: 36px;
        height: 36px;
        border: 3px solid rgba(6, 182, 212, 0.2);
        border-top-color: var(--accent-cyan);
        border-radius: 50%;
        animation: spin 0.9s linear infinite;
        margin: 0 auto 12px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
</style>
@endsection

@section('content')
<!-- Top Action Toolbar -->
<div class="action-toolbar">
    <button onclick="triggerStartBot()" class="btn btn-primary" id="btnStartBot">
        <span>🚀</span> <span>বট চালু করুন (npm start)</span>
    </button>
    <button onclick="triggerRestartBot()" class="btn btn-secondary">
        <span>🔄</span> <span>রিস্টার্ট</span>
    </button>
    <button onclick="triggerClearSession()" class="btn btn-secondary" style="background: rgba(244, 63, 94, 0.12); color: #f43f5e; border-color: rgba(244, 63, 94, 0.3);" title="পুরনো সেশন মুছে নতুন ফ্রেশ কিউআর কোড আনুন">
        <span>🔄</span> <span>ফ্রেশ QR কোড তৈরি (সেশন রিসেট)</span>
    </button>
    <button onclick="triggerLogoutBot()" class="btn btn-danger" id="btnLogoutBot" style="display:none;">
        <span>🔌</span> <span>ডিসকানেক্ট</span>
    </button>
</div>

<!-- Main WhatsApp Status & Scanner Card -->
<div class="card">
    <div class="card-header">
        <div class="card-title">
            <span class="status-dot" id="botStatusDot" style="background: #f59e0b; box-shadow: 0 0 10px #f59e0b;"></span>
            <span id="botStatusTitle">বট স্ট্যাটাস যাচাই হচ্ছে...</span>
        </div>
        <div style="font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#06b6d4;"></span>
            <span id="lastCheckedTime">লাইভ সিঙ্ক চলছে</span>
        </div>
    </div>

    <!-- 1. Connected View (WhatsApp সক্রিয়) -->
    <div id="viewConnected" style="display:none;">
        <div class="connected-hero-card">
            <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 8px;">
                <span style="font-size: 32px;">🟢</span>
                <div>
                    <h3 style="font-size: 20px; font-weight: 700; color: #10b981;">WhatsApp সফলভাবে সংযুক্ত ও সক্রিয়!</h3>
                    <p style="font-size: 13px; color: var(--text-muted);">Laravel ও Node.js ইন্টিগ্রেশন ব্যাকগ্রাউন্ডে সক্রিয় রয়েছে</p>
                </div>
            </div>

            <div class="hero-meta-grid">
                <div class="meta-box">
                    <div class="meta-box-label">সংযুক্ত ফোন নম্বর</div>
                    <div class="meta-box-val" id="valPhone" style="color: #10b981;">-</div>
                </div>
                <div class="meta-box">
                    <div class="meta-box-label">প্রোফাইল নাম</div>
                    <div class="meta-box-val" id="valName">-</div>
                </div>
                <div class="meta-box">
                    <div class="meta-box-label">সংযুক্ত হওয়ার সময়</div>
                    <div class="meta-box-val" id="valTime" style="color: var(--accent-cyan);">-</div>
                </div>
            </div>

            <!-- কিউআর কোড কেন নেই ও কীভাবে নতুন একাউন্ট স্ক্যান করবেন তার ইনফো বক্স -->
            <div style="margin-top: 18px; padding: 16px 20px; border-radius: 12px; background: rgba(13, 18, 30, 0.7); border: 1px solid rgba(6, 182, 212, 0.3);">
                <div style="font-weight: 700; color: var(--accent-cyan); display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px;">
                    <span>ℹ️</span> <span>ড্যাশবোর্ডে কিউআর কোড কেন দেখা যাচ্ছে না?</span>
                </div>
                <p style="font-size: 13px; color: #d1d5db; line-height: 1.6;">
                    আপনার WhatsApp বর্তমানে উপরের নম্বরে <strong>সফলভাবে লগইন ও কানেক্টেড</strong> রয়েছে। 
                    WhatsApp-এর অফিসিয়াল প্রোটোকল অনুযায়ী একাউন্ট অলরেডি লগইন থাকলে কোনো QR কোড দেখানোর প্রয়োজন হয় না।
                </p>
                <p style="font-size: 13px; color: #d1d5db; line-height: 1.6; margin-top: 8px;">
                    <strong>আপনি কি আপনার নিজের ফোন বা অন্য কোনো নতুন একাউন্ট দিয়ে স্ক্যান করতে চান?</strong><br>
                    তাহলে নিচের লাল বাটনে চাপ দিন। এটি বর্তমান সেশন লগআউট করে সাথে সাথে একটি একদম <strong>নতুন ফ্রেশ QR কোড</strong> নিয়ে আসবে:
                </p>
                <div style="margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <button type="button" class="btn btn-danger" onclick="triggerClearSession()" style="font-weight: 700; padding: 10px 20px;">
                        <span>🔄</span> <span>অন্য একাউন্ট স্ক্যান করুন (লগআউট ও ফ্রেশ QR কোড)</span>
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="triggerLogoutBot()">
                        <span>🔌</span> <span>শুধুমাত্র সংযোগ বিচ্ছিন্ন করুন</span>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- 2. QR Code Scanner View (কিউআর কোড স্ক্যানার) -->
    <div id="viewQr" style="display:none;">
        <div class="qr-container-grid">
            <div>
                <h2 style="font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                    <span>📱</span> <span>টার্মিনাল ছাড়া সরাসরি এই স্ক্রিন থেকেই স্ক্যান করুন</span>
                </h2>
                <p style="color: var(--text-muted); font-size: 13px; line-height: 1.5;">
                    আপনাকে আর সার্ভার, cPanel বা টার্মিনালে কোনো কোড খুঁজতে হবে না। সরাসরি এই স্ক্রিনের কিউআর কোডটি আপনার WhatsApp দিয়ে স্ক্যান করলেই বট লাইভ হয়ে যাবে:
                </p>

                <div class="step-list">
                    <div class="step-item">
                        <div class="step-num">১</div>
                        <div>আপনার ফোনের <strong>WhatsApp</strong> অ্যাপটি চালু করুন।</div>
                    </div>
                    <div class="step-item">
                        <div class="step-num">২</div>
                        <div>উপরে ডানপাশের তিনটি ডট (⋮) বা Settings থেকে <strong>Linked Devices</strong>-এ যান।</div>
                    </div>
                    <div class="step-item">
                        <div class="step-num">৩</div>
                        <div><strong>Link a Device</strong> বাটনে ক্লিক করে পাশের QR কোডটি স্ক্যান করুন।</div>
                    </div>
                </div>

                <!-- ক্যামেরা ছাড়া পেয়ারিং কোড অপশন -->
                <div style="margin-top: 18px; padding: 14px 18px; border-radius: 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color);">
                    <div style="font-size: 12px; font-weight: 600; color: var(--accent-cyan); margin-bottom: 6px;">
                        🔑 ক্যামেরা ছাড়া ৮-ডিজিটের পেয়ারিং কোড দিয়ে যুক্ত হতে চান?
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <input type="text" id="pairingPhoneInput" placeholder="ফোন নম্বর (যেমন: 88017XXXXXXXX)" class="form-input" style="padding: 8px 12px; font-size: 13px;">
                        <button type="button" onclick="triggerRequestPairingCode()" class="btn btn-secondary" id="btnGetPairingCode" style="white-space: nowrap; padding: 8px 16px;">
                            কোড পান
                        </button>
                    </div>
                    <div id="pairingCodeContainer" style="display:none; margin-top: 12px; background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.4); border-radius: 10px; padding: 12px; text-align: center;">
                        <span style="font-size: 11px; color: var(--accent-cyan); font-weight: 600; display: block;">আপনার WhatsApp পেয়ারিং কোড:</span>
                        <strong id="pairingCodeVal" style="font-size: 24px; color: #fff; letter-spacing: 4px; font-family: monospace; display: block; margin-top: 4px;"></strong>
                        <span style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: block;">ফোনের নোটিফিকেশনে এই কোডটি প্রবেশ করান</span>
                    </div>
                </div>

                <div style="font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; margin-top: 14px;">
                    <span class="status-dot" style="background:#f59e0b; width:8px; height:8px;"></span>
                    <em>কিউআর কোডটি প্রতি কয়েক সেকেন্ড পর পর স্বয়ংক্রিয়ভাবে রিফ্রেশ হচ্ছে।</em>
                </div>
            </div>

            <!-- কিউআর কোড ইমেজ বক্স -->
            <div class="qr-white-box">
                <img id="qrImageElement" src="" alt="WhatsApp QR Code" style="display:none;">
                <div id="qrSpinnerElement" style="color: #64748b;">
                    <div class="spinner-sm"></div>
                    <div style="font-size: 13px; font-weight: 600; color: #334155;">QR কোড তৈরি হচ্ছে...</div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">৫-১০ সেকেন্ড সময় লাগতে পারে</div>
                </div>
                <div style="margin-top: 12px;">
                    <button type="button" onclick="triggerClearSession()" class="btn btn-secondary" style="font-size: 11px; padding: 6px 12px; color: #475569; border-color: #cbd5e1; background: #f8fafc;">
                        🔄 কিউআর রিফ্রেশ করুন
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- 3. Offline View (বট বন্ধ রয়েছে) -->
    <div id="viewOffline" style="display:none; text-align: center; padding: 40px 20px;">
        <div style="font-size: 50px; margin-bottom: 12px;">🔴</div>
        <h3 style="font-size: 20px; color: #fff; font-weight: 700; margin-bottom: 8px;">Node.js FREND বট বর্তমানে বন্ধ রয়েছে</h3>
        <p style="color: var(--text-muted); font-size: 14px; max-width: 520px; margin: 0 auto 20px auto; line-height: 1.6;">
            বট বন্ধ থাকলে কিউআর কোড তৈরি হতে পারে না। আপনি সরাসরি নিচের <strong>"এক ক্লিকে বট চালু করুন"</strong> বাটনে চাপ দিন অথবা cPanel-এর "Setup Node.js App" থেকে বটটি চালু করুন।
        </p>
        <button onclick="triggerStartBot()" class="btn btn-primary" style="padding: 12px 28px; font-size: 15px;">
            <span>🚀</span> <span>এক ক্লিকে বট চালু করুন (npm start)</span>
        </button>
    </div>
</div>

<!-- Quick Direct WhatsApp Message Sender Card -->
<div class="card">
    <div class="card-header">
        <div class="card-title">
            <span>💬</span> <span>সরাসরি WhatsApp বার্তা পাঠান (টেস্ট ও নোটিফিকেশন)</span>
        </div>
        <span style="font-size: 12px; color: var(--text-muted);">বট কানেক্টেড থাকলে যেকোনো নম্বরে বার্তা যাবে</span>
    </div>

    <form id="sendMessageForm" onsubmit="handleSendMessage(event)">
        <div class="form-row">
            <div>
                <input type="text" id="targetPhone" class="form-input" placeholder="ফোন নম্বর (যেমন: 017XXXXXXXX)" required>
            </div>
            <div>
                <input type="text" id="targetMessage" class="form-input" placeholder="বার্তা লিখুন (যেমন: হ্যালো, এটি Laravel থেকে পাঠানো)" required>
            </div>
            <div>
                <button type="submit" class="btn btn-primary" id="btnSend">
                    <span>✉️</span> <span>মেসেজ পাঠান</span>
                </button>
            </div>
        </div>
    </form>
    <div id="sendResultMsg" style="margin-top: 14px; font-size: 13px; display:none; padding: 10px 14px; border-radius: 8px;"></div>
</div>

<!-- Diagnostics & Shared Hosting Info Card -->
<div class="card" style="border-color: rgba(255, 255, 255, 0.05);">
    <div class="card-header">
        <div class="card-title" style="font-size: 14px;">
            <span>🌐</span> <span>cPanel শেয়ার্ড হোস্টিং সিস্টেম ইনফরমেশন</span>
        </div>
        <a href="{{ route('admin.settings.index') }}" class="btn btn-secondary" style="font-size: 11px; padding: 5px 12px;">
            ⚙️ সম্পূর্ণ সেটিংস দেখুন
        </a>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; font-size: 12px; color: var(--text-muted);">
        <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px;">
            <div style="color: #fff; font-weight: 600; margin-bottom: 4px;">📡 Bot URL Gateway:</div>
            <code>{{ env('FREND_BOT_URL', 'http://127.0.0.1:3000') }}</code>
        </div>
        <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px;">
            <div style="color: #fff; font-weight: 600; margin-bottom: 4px;">📂 Bot Runner Directory:</div>
            <code>{{ env('FREND_BOT_PATH', 'whatsapp_bot_runner') }}</code>
        </div>
        <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px;">
            <div style="color: #fff; font-weight: 600; margin-bottom: 4px;">⏰ cPanel Cron Command:</div>
            <code>* * * * * curl -s "https://test330.xyz/cron/reminders/process" >/dev/null 2>&1</code>
        </div>
    </div>
</div>
@endsection

@section('scripts')
<script>
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

    // লাইভ স্ট্যাটাস চেক ফাংশন (প্রতি ২.৫ সেকেন্ড পর পর ব্রাউজার কল করে)
    async function checkStatus() {
        try {
            const res = await fetch('{{ route("admin.whatsapp.status") }}');
            const data = await res.json();

            const dot = document.getElementById('botStatusDot');
            const title = document.getElementById('botStatusTitle');
            const viewConnected = document.getElementById('viewConnected');
            const viewQr = document.getElementById('viewQr');
            const viewOffline = document.getElementById('viewOffline');
            const btnLogout = document.getElementById('btnLogoutBot');
            const qrImg = document.getElementById('qrImageElement');
            const qrSpinner = document.getElementById('qrSpinnerElement');

            document.getElementById('lastCheckedTime').innerText = 'আপডেট: ' + new Date().toLocaleTimeString('bn-BD');

            if (data.status === 'CONNECTED') {
                dot.style.background = '#10b981';
                dot.style.boxShadow = '0 0 12px #10b981';
                title.innerText = 'অনলাইনে সংযুক্ত (Connected)';
                viewConnected.style.display = 'block';
                viewQr.style.display = 'none';
                viewOffline.style.display = 'none';
                if (btnLogout) btnLogout.style.display = 'inline-flex';

                document.getElementById('valPhone').innerText = data.userPhone || 'সক্রিয়';
                document.getElementById('valName').innerText = data.userName ? `${data.userName}` : 'অ্যাসিস্ট্যান্ট';
                if (data.connectedAt) {
                    document.getElementById('valTime').innerText = new Date(data.connectedAt).toLocaleTimeString('bn-BD');
                }
            } else if (data.status === 'OFFLINE') {
                dot.style.background = '#f43f5e';
                dot.style.boxShadow = '0 0 10px #f43f5e';
                title.innerText = 'বট বন্ধ রয়েছে (Offline)';
                viewConnected.style.display = 'none';
                viewQr.style.display = 'none';
                viewOffline.style.display = 'block';
                if (btnLogout) btnLogout.style.display = 'none';
            } else if (data.qrImage) {
                dot.style.background = '#f59e0b';
                dot.style.boxShadow = '0 0 12px #f59e0b';
                title.innerText = 'QR কোড স্ক্যানের অপেক্ষায়...';
                viewConnected.style.display = 'none';
                viewQr.style.display = 'block';
                viewOffline.style.display = 'none';
                if (btnLogout) btnLogout.style.display = 'none';

                qrImg.src = data.qrImage;
                qrImg.style.display = 'block';
                qrSpinner.style.display = 'none';

                if (data.pairingCode) {
                    document.getElementById('pairingCodeContainer').style.display = 'block';
                    document.getElementById('pairingCodeVal').innerText = data.pairingCode;
                }
            } else {
                dot.style.background = '#f59e0b';
                dot.style.boxShadow = '0 0 12px #f59e0b';
                title.innerText = 'বট প্রস্তুত হচ্ছে (QR কোড তৈরি হচ্ছে)...';
                viewConnected.style.display = 'none';
                viewQr.style.display = 'block';
                viewOffline.style.display = 'none';
                if (btnLogout) btnLogout.style.display = 'none';
                qrImg.style.display = 'none';
                qrSpinner.style.display = 'block';
            }
        } catch (err) {
            console.warn('Status polling error:', err);
        }
    }

    // বট চালু করা (Start Bot)
    async function triggerStartBot() {
        const btn = document.getElementById('btnStartBot');
        btn.disabled = true;
        btn.innerText = '⏳ শুরু হচ্ছে...';
        try {
            const res = await fetch('{{ route("admin.whatsapp.start") }}', {
                method: 'POST',
                headers: { 'X-CSRF-TOKEN': csrfToken, 'Accept': 'application/json' }
            });
            const data = await res.json();
            alert(data.message || 'বট চালু করা হয়েছে!');
            setTimeout(checkStatus, 2000);
        } catch (err) {
            alert('বট চালু করতে সমস্যা হয়েছে: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>🚀</span> <span>বট চালু করুন (npm start)</span>';
        }
    }

    // বট রিস্টার্ট করা
    async function triggerRestartBot() {
        if (!confirm('আপনি কি WhatsApp বট রিস্টার্ট করতে চান?')) return;
        try {
            const res = await fetch('{{ route("admin.whatsapp.restart") }}', {
                method: 'POST',
                headers: { 'X-CSRF-TOKEN': csrfToken, 'Accept': 'application/json' }
            });
            const data = await res.json();
            alert(data.message || 'বট রিস্টার্ট সম্পন্ন!');
            setTimeout(checkStatus, 1500);
        } catch (err) {
            alert('রিস্টার্ট সমস্যা: ' + err.message);
        }
    }

    // লগআউট করা
    async function triggerLogoutBot() {
        if (!confirm('আপনি কি WhatsApp সংযোগ বিচ্ছিন্ন করতে চান? পুনরায় যুক্ত হতে আবার QR কোড স্ক্যান করতে হবে।')) return;
        try {
            const res = await fetch('{{ route("admin.whatsapp.logout") }}', {
                method: 'POST',
                headers: { 'X-CSRF-TOKEN': csrfToken, 'Accept': 'application/json' }
            });
            const data = await res.json();
            alert(data.message || 'সংযোগ বিচ্ছিন্ন করা হয়েছে।');
            setTimeout(checkStatus, 1500);
        } catch (err) {
            alert('লগআউট ব্যর্থ: ' + err.message);
        }
    }

    // সেশন সম্পূর্ণ পরিষ্কার ও নতুন ফ্রেশ QR তৈরি করা
    async function triggerClearSession() {
        if (!confirm('আপনি কি পূর্বের WhatsApp সেশন মুছে ফেলে একদম নতুন ফ্রেশ QR কোড তৈরি করতে চান? এটি দিয়ে আপনার নিজস্ব ফোন বা অন্য যেকোনো নম্বর স্ক্যান করতে পারবেন।')) return;
        try {
            // UI তাৎক্ষণিকভাবে QR স্ক্যানার ভিউতে সুইচ করে
            document.getElementById('viewConnected').style.display = 'none';
            document.getElementById('viewQr').style.display = 'block';
            document.getElementById('qrSpinnerElement').style.display = 'block';
            document.getElementById('qrImageElement').style.display = 'none';

            const res = await fetch('{{ route("admin.whatsapp.clear-session") }}', {
                method: 'POST',
                headers: { 'X-CSRF-TOKEN': csrfToken, 'Accept': 'application/json' }
            });
            const data = await res.json();
            alert(data.message || 'সেশন পরিষ্কার করা হয়েছে। নতুন QR কোড তৈরি হচ্ছে...');
            setTimeout(checkStatus, 2000);
        } catch (err) {
            alert('সেশন ক্লিয়ার করতে সমস্যা: ' + err.message);
        }
    }

    // পেয়ারিং কোড রিকোয়েস্ট করা (ক্যামেরা ছাড়া কোড দিয়ে কানেক্ট)
    async function triggerRequestPairingCode() {
        const phone = document.getElementById('pairingPhoneInput').value.trim();
        if (!phone || phone.length < 10) {
            alert('অনুগ্রহ করে সঠিক আন্তর্জাতিক ফোন নম্বর দিন (যেমন: 88017XXXXXXXX)');
            return;
        }

        const btn = document.getElementById('btnGetPairingCode');
        btn.disabled = true;
        btn.innerText = 'অপেক্ষা করুন...';

        try {
            const res = await fetch('{{ route("admin.whatsapp.request-code") }}', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ phone })
            });
            const data = await res.json();
            if (data.success && data.code) {
                document.getElementById('pairingCodeContainer').style.display = 'block';
                document.getElementById('pairingCodeVal').innerText = data.code;
                alert('পেয়ারিং কোড তৈরি হয়েছে! আপনার ফোনে এই কোডটি লিখুন: ' + data.code);
            } else {
                alert('ব্যর্থ: ' + (data.error || 'পেয়ারিং কোড তৈরি করা যায়নি।'));
            }
        } catch (err) {
            alert('সমস্যা: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = 'কোড পান';
        }
    }

    // টেস্ট WhatsApp মেসেজ পাঠানো
    async function handleSendMessage(e) {
        e.preventDefault();
        const phone = document.getElementById('targetPhone').value.trim();
        const message = document.getElementById('targetMessage').value.trim();
        const btn = document.getElementById('btnSend');
        const msgBox = document.getElementById('sendResultMsg');

        if (!phone || !message) return;

        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> <span>পাঠানো হচ্ছে...</span>';
        msgBox.style.display = 'none';

        try {
            const res = await fetch('{{ route("admin.whatsapp.send") }}', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ phone, message })
            });
            const data = await res.json();
            msgBox.style.display = 'block';
            if (data.success) {
                msgBox.style.background = 'rgba(16, 185, 129, 0.15)';
                msgBox.style.color = '#34d399';
                msgBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
                msgBox.innerText = '✅ মেসেজ সফলভাবে পাঠানো হয়েছে!';
                document.getElementById('targetMessage').value = '';
            } else {
                msgBox.style.background = 'rgba(244, 63, 94, 0.15)';
                msgBox.style.color = '#f43f5e';
                msgBox.style.border = '1px solid rgba(244, 63, 94, 0.3)';
                msgBox.innerText = '❌ ব্যর্থ: ' + (data.error || 'মেসেজ পাঠানো যায়নি');
            }
        } catch (err) {
            msgBox.style.display = 'block';
            msgBox.style.background = 'rgba(244, 63, 94, 0.15)';
            msgBox.style.color = '#f43f5e';
            msgBox.innerText = '❌ সমস্যা: ' + err.message;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>✉️</span> <span>মেসেজ পাঠান</span>';
        }
    }

    // পেজ লোড হলে প্রথমবার চেক এবং প্রতি ২.৫ সেকেন্ডে পোলিং
    checkStatus();
    setInterval(checkStatus, 2500);
</script>
@endsection
