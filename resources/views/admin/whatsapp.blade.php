<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot Admin — FREND কন্ট্রোল সেন্টার</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <style>
        :root {
            --bg: #0b0f19;
            --card-bg: rgba(22, 27, 46, 0.75);
            --card-border: rgba(255, 255, 255, 0.08);
            --primary: #25d366;
            --primary-hover: #1ebd59;
            --accent: #6366f1;
            --accent-hover: #4f46e5;
            --text: #f3f4f6;
            --text-muted: #9ca3af;
            --danger: #ef4444;
            --warning: #f59e0b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Hind Siliguri', 'Inter', -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            padding: 24px;
            background-image: 
                radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.12) 0%, transparent 40%),
                radial-gradient(circle at 90% 80%, rgba(37, 211, 102, 0.1) 0%, transparent 40%);
        }
        .container { max-width: 1100px; margin: 0 auto; }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 16px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--card-border);
            margin-bottom: 24px;
        }
        .brand { display: flex; align-items: center; gap: 14px; }
        .brand-icon {
            font-size: 36px;
            background: rgba(37, 211, 102, 0.12);
            border: 1px solid rgba(37, 211, 102, 0.3);
            border-radius: 14px;
            padding: 8px 14px;
        }
        .brand-title h1 { font-size: 26px; font-weight: 700; color: #fff; }
        .brand-title p { font-size: 13px; color: var(--text-muted); }
        .header-actions { display: flex; gap: 10px; align-items: center; }
        
        .btn {
            border: none;
            padding: 10px 18px;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
            font-family: inherit;
        }
        .btn-primary { background: var(--primary); color: #000; }
        .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
        .btn-secondary { background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); color: #c7d2fe; }
        .btn-secondary:hover { background: rgba(99, 102, 241, 0.35); }
        .btn-danger { background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; }
        .btn-danger:hover { background: rgba(239, 68, 68, 0.35); }

        .card {
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--card-border);
            border-radius: 18px;
            padding: 24px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            margin-bottom: 24px;
        }
        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 18px;
        }
        .card-title { font-size: 18px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 10px; }

        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
        }
        .status-dot.online { background: #25d366; box-shadow: 0 0 12px #25d366; }
        .status-dot.waiting { background: #f59e0b; box-shadow: 0 0 12px #f59e0b; animation: pulse 1.5s infinite; }
        .status-dot.offline { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
        @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 1; }
            100% { opacity: 0.4; }
        }

        .qr-section {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            padding: 10px 0;
        }
        .qr-instructions { flex: 1; min-width: 300px; }
        .step-list { margin: 16px 0; }
        .step-item {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            margin-bottom: 12px;
            font-size: 14px;
            color: #d1d5db;
        }
        .step-num {
            background: rgba(37, 211, 102, 0.15);
            color: #25d366;
            width: 26px;
            height: 26px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 12px;
            flex-shrink: 0;
        }
        .qr-box {
            background: #ffffff;
            padding: 16px;
            border-radius: 16px;
            box-shadow: 0 12px 35px rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 250px;
            min-height: 250px;
        }
        .qr-box img { width: 220px; height: 220px; border-radius: 8px; display: block; }
        
        .connected-box {
            display: flex;
            align-items: center;
            gap: 20px;
            background: rgba(37, 211, 102, 0.08);
            border: 1px solid rgba(37, 211, 102, 0.3);
            border-radius: 14px;
            padding: 20px;
        }
        .connected-info h3 { font-size: 20px; color: #25d366; margin-bottom: 4px; }
        .connected-info p { color: var(--text-muted); font-size: 14px; }

        .form-grid {
            display: grid;
            grid-template-columns: 1fr 2fr auto;
            gap: 12px;
            align-items: center;
        }
        @media(max-width: 768px) {
            .form-grid { grid-template-columns: 1fr; }
        }
        .form-control {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--card-border);
            border-radius: 10px;
            padding: 12px 16px;
            color: #fff;
            font-size: 14px;
            outline: none;
            width: 100%;
            font-family: inherit;
        }
        .form-control:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }
        .spinner {
            width: 32px;
            height: 32px;
            border: 3px solid rgba(255, 255, 255, 0.1);
            border-top-color: #25d366;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header -->
        <header class="header">
            <div class="brand">
                <div class="brand-icon">🤖</div>
                <div class="brand-title">
                    <h1>FREND — WhatsApp অ্যাডমিন হাব</h1>
                    <p>Laravel + Shared Hosting ইন্টিগ্রেশন কন্ট্রোল প্যানেল</p>
                </div>
            </div>
            <div class="header-actions">
                <button onclick="triggerStartBot()" class="btn btn-primary" id="btnStartBot">
                    🚀 বট চালু করুন (npm start)
                </button>
                <button onclick="triggerRestartBot()" class="btn btn-secondary">
                    🔄 রিস্টার্ট
                </button>
                <button onclick="triggerLogoutBot()" class="btn btn-danger" id="btnLogoutBot" style="display:none;">
                    🔌 ডিসকানেক্ট
                </button>
            </div>
        </header>

        <!-- WhatsApp Live Scanner & Status Card -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">
                    <span class="status-dot waiting" id="botStatusDot"></span>
                    <span id="botStatusTitle">বট স্ট্যাটাস যাচাই হচ্ছে...</span>
                </div>
                <div style="font-size: 13px; color: var(--text-muted);" id="lastCheckedTime">
                    লাইভ সিঙ্ক চলছে
                </div>
            </div>

            <!-- 1. Connected View -->
            <div id="viewConnected" style="display:none;">
                <div class="connected-box">
                    <div style="font-size: 40px;">🟢</div>
                    <div class="connected-info">
                        <h3>WhatsApp সফলভাবে সংযুক্ত ও সক্রিয়!</h3>
                        <p>
                            সংযুক্ত ফোন: <strong id="valPhone" style="color:#fff;">-</strong> 
                            <span id="valName"></span>
                            <span id="valTime" style="margin-left: 10px; color: #9ca3af;"></span>
                        </p>
                        <p style="margin-top: 6px; font-size: 13px; color: #c7d2fe;">
                            💡 আপনার Laravel অ্যাপ্লিকেশন এখন যেকোনো সময় গ্রাহকদের স্বয়ংক্রিয় WhatsApp মেসেজ পাঠাতে প্রস্তুত।
                        </p>
                    </div>
                </div>
            </div>

            <!-- 2. QR Code Scanner View -->
            <div id="viewQr" style="display:none;">
                <div class="qr-section">
                    <div class="qr-instructions">
                        <h2 style="font-size: 20px; color: #fff; margin-bottom: 8px;">
                            📱 টার্মিনাল ছাড়া সরাসরি এই স্ক্রিন থেকেই স্ক্যান করুন
                        </h2>
                        <p style="color: var(--text-muted); font-size: 14px;">
                            আপনাকে আর সার্ভার বা টার্মিনালে কিউআর কোড খুঁজতে হবে না। সরাসরি এই স্ক্রিনের কিউআর কোডটি WhatsApp অ্যাপ দিয়ে স্ক্যান করুন:
                        </p>
                        <div class="step-list">
                            <div class="step-item">
                                <div class="step-num">১</div>
                                <div>আপনার ফোনের <strong>WhatsApp</strong> অ্যাপটি চালু করুন।</div>
                            </div>
                            <div class="step-item">
                                <div class="step-num">২</div>
                                <div>উপরে ডানপাশের তিনটি ডট (⋮) বা Settings থেকে <strong>Linked Devices</strong>-এ চাপ দিন।</div>
                            </div>
                            <div class="step-item">
                                <div class="step-num">৩</div>
                                <div><strong>Link a Device</strong> বাটনে ক্লিক করে ডানপাশের QR কোডটি স্ক্যান করুন।</div>
                            </div>
                        </div>
                        <div style="font-size: 12px; color: #9ca3af; display: flex; align-items: center; gap: 6px;">
                            <span class="status-dot waiting"></span>
                            <em>কিউআর কোডটি প্রতি কয়েক সেকেন্ডে স্বয়ংক্রিয়ভাবে রিফ্রেশ হচ্ছে।</em>
                        </div>
                    </div>
                    <div class="qr-box">
                        <img id="qrImageElement" src="" alt="WhatsApp QR Code" style="display:none;">
                        <div id="qrSpinnerElement" style="text-align: center; padding: 40px 10px; color: #475569;">
                            <div class="spinner" style="margin: 0 auto 12px auto;"></div>
                            <div style="font-size: 13px;">QR কোড তৈরি হচ্ছে...</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 3. Offline View -->
            <div id="viewOffline" style="display:none; text-align: center; padding: 40px 20px;">
                <div style="font-size: 48px; margin-bottom: 12px;">🔴</div>
                <h3 style="font-size: 20px; color: #fff; margin-bottom: 8px;">Node.js FREND বট বর্তমানে বন্ধ রয়েছে</h3>
                <p style="color: var(--text-muted); font-size: 14px; max-width: 500px; margin: 0 auto 20px auto;">
                    বটটি চালু করতে উপরের <strong>"🚀 বট চালু করুন (npm start)"</strong> বাটনে ক্লিক করুন অথবা cPanel-এর "Setup Node.js App" থেকে অ্যাপ্লিকেশনটি Start করুন।
                </p>
                <button onclick="triggerStartBot()" class="btn btn-primary" style="padding: 12px 24px; font-size: 15px;">
                    🚀 এক ক্লিকে বট চালু করুন
                </button>
            </div>
        </div>

        <!-- Quick WhatsApp Message Sender -->
        <div class="card">
            <div class="card-title" style="margin-bottom: 16px;">
                <span>💬 সরাসরি WhatsApp মেসেজ পাঠান (টেস্ট ও নোটিফিকেশন)</span>
            </div>
            <form id="sendMessageForm" onsubmit="handleSendMessage(event)">
                <div class="form-grid">
                    <div>
                        <input type="text" id="targetPhone" class="form-control" placeholder="ফোন নম্বর (যেমন: 017XXXXXXXX)" required>
                    </div>
                    <div>
                        <input type="text" id="targetMessage" class="form-control" placeholder="বার্তা লিখুন (যেমন: হ্যালো, এটি Laravel থেকে পাঠানো)" required>
                    </div>
                    <div>
                        <button type="submit" class="btn btn-primary" id="btnSend">
                            ✉️ মেসেজ পাঠান
                        </button>
                    </div>
                </div>
            </form>
            <div id="sendResultMsg" style="margin-top: 12px; font-size: 13px; display:none;"></div>
        </div>
    </div>

    <script>
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

        // লাইভ স্ট্যাটাস চেক ফাংশন (প্রতি ২.৫ সেকেন্ড পর পর)
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
                    dot.className = 'status-dot online';
                    title.innerText = 'অনলাইনে সংযুক্ত (Connected)';
                    viewConnected.style.display = 'block';
                    viewQr.style.display = 'none';
                    viewOffline.style.display = 'none';
                    btnLogout.style.display = 'inline-flex';

                    document.getElementById('valPhone').innerText = data.userPhone || 'সক্রিয়';
                    document.getElementById('valName').innerText = data.userName ? `(${data.userName})` : '';
                    if (data.connectedAt) {
                        document.getElementById('valTime').innerText = '· ' + new Date(data.connectedAt).toLocaleTimeString('bn-BD');
                    }
                } else if (data.status === 'WAITING_FOR_QR' && data.qrImage) {
                    dot.className = 'status-dot waiting';
                    title.innerText = 'QR কোড স্ক্যানের অপেক্ষায়...';
                    viewConnected.style.display = 'none';
                    viewQr.style.display = 'block';
                    viewOffline.style.display = 'none';
                    btnLogout.style.display = 'none';

                    qrImg.src = data.qrImage;
                    qrImg.style.display = 'block';
                    qrSpinner.style.display = 'none';
                } else if (data.status === 'OFFLINE') {
                    dot.className = 'status-dot offline';
                    title.innerText = 'বট বন্ধ রয়েছে (Offline)';
                    viewConnected.style.display = 'none';
                    viewQr.style.display = 'none';
                    viewOffline.style.display = 'block';
                    btnLogout.style.display = 'none';
                } else {
                    dot.className = 'status-dot waiting';
                    title.innerText = 'বট প্রস্তুত হচ্ছে...';
                    viewConnected.style.display = 'none';
                    viewQr.style.display = 'block';
                    viewOffline.style.display = 'none';
                    btnLogout.style.display = 'none';
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
                btn.innerText = '🚀 বট চালু করুন (npm start)';
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
            if (!confirm('আপনি কি WhatsApp সংযোগ বিচ্ছিন্ন করতে চান? পুনরায় সংযোগ করতে আবার QR স্ক্যান করতে হবে।')) return;
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

        // মেসেজ পাঠানো
        async function handleSendMessage(e) {
            e.preventDefault();
            const phone = document.getElementById('targetPhone').value.trim();
            const message = document.getElementById('targetMessage').value.trim();
            const btn = document.getElementById('btnSend');
            const msgBox = document.getElementById('sendResultMsg');

            if (!phone || !message) return;

            btn.disabled = true;
            btn.innerText = 'পাঠানো হচ্ছে...';
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
                    msgBox.style.color = '#25d366';
                    msgBox.innerText = '✅ মেসেজ সফলভাবে পাঠানো হয়েছে!';
                    document.getElementById('targetMessage').value = '';
                } else {
                    msgBox.style.color = '#ef4444';
                    msgBox.innerText = '❌ ব্যর্থ: ' + (data.error || 'পাঠানো যায়নি');
                }
            } catch (err) {
                msgBox.style.display = 'block';
                msgBox.style.color = '#ef4444';
                msgBox.innerText = '❌ সমস্যা: ' + err.message;
            } finally {
                btn.disabled = false;
                btn.innerText = '✉️ মেসেজ পাঠান';
            }
        }

        // পেজ লোড হলে প্রথমবার চেক এবং প্রতি ২.৫ সেকেন্ডে পোলিং
        checkStatus();
        setInterval(checkStatus, 2500);
    </script>
</body>
</html>
