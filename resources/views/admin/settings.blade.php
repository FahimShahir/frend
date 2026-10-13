@extends('admin.layout')

@section('title', 'সিস্টেম সেটিংস ও ওয়েব টার্মিনাল')
@section('page_title', 'সিস্টেম সেটিংস ও ওয়েব টার্মিনাল')
@section('page_subtitle', 'cPanel শেয়ার্ড হোস্টিংয়ের জন্য টার্মিনাল ও ফাইল ম্যানেজার ছাড়া সরাসরি ব্রাউজার থেকে সম্পূর্ণ সিস্টেম নিয়ন্ত্রণ')

@section('content')
<div style="display: flex; flex-direction: column; gap: 24px;">

    <!-- 1. System Health Quick Stats -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
        <div class="card" style="padding: 16px 20px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">PHP ভার্সন ও পরিবেশ</div>
            <div style="font-size: 18px; font-weight: 700; color: #fff;">PHP {{ $diagnostics['php_version'] }}</div>
            <div style="font-size: 11px; color: var(--accent-cyan); margin-top: 4px;">{{ $diagnostics['os'] }}</div>
        </div>

        <div class="card" style="padding: 16px 20px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">MySQL ডেটাবেস</div>
            <div style="font-size: 18px; font-weight: 700; color: {{ str_contains($dbStatus, 'CONNECTED') ? 'var(--accent-emerald)' : 'var(--accent-rose)' }};">
                {{ str_contains($dbStatus, 'CONNECTED') ? 'সক্রিয় (Connected)' : 'বিচ্ছিন্ন' }}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">{{ $config['db_database'] }}</div>
        </div>

        <div class="card" style="padding: 16px 20px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">WhatsApp গেটওয়ে</div>
            <div style="font-size: 18px; font-weight: 700; color: {{ ($botStatus['status'] ?? '') === 'CONNECTED' ? 'var(--accent-emerald)' : 'var(--accent-amber)' }};">
                {{ $botStatus['status'] ?? 'OFFLINE' }}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">{{ $config['frend_bot_url'] }}</div>
        </div>

        <div class="card" style="padding: 16px 20px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Gemini AI স্ট্যাটাস</div>
            <div style="font-size: 18px; font-weight: 700; color: {{ $config['has_gemini_key'] ? 'var(--accent-cyan)' : 'var(--accent-amber)' }};">
                {{ $config['has_gemini_key'] ? 'কনফিগার করা আছে' : 'API Key প্রয়োজন' }}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">{{ $config['has_gemini_key'] ? $config['gemini_key_masked'] : 'সেটিংস থেকে যুক্ত করুন' }}</div>
        </div>
    </div>

    <!-- 2. Web Artisan Console (Terminal Replacement) -->
    <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <div class="card-title">
                <span>💻</span>
                <span>ওয়েব আর্টিসান টার্মিনাল (Web Artisan Console)</span>
            </div>
            <span style="font-size: 12px; color: var(--accent-cyan); background: rgba(6, 182, 212, 0.12); padding: 4px 10px; border-radius: 6px;">
                SSH / cPanel Terminal প্রয়োজন নেই
            </span>
        </div>
        <div style="padding: 20px;">
            <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
                শেয়ার্ড হোস্টিংয়ে টার্মিনাল না থাকলেও নিচে ক্লিক করে সরাসরি যেকোনো Laravel Artisan কমান্ড চালাতে পারেন:
            </p>

            <!-- Quick Action Buttons -->
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px;">
                <button type="button" class="btn btn-secondary" onclick="executeArtisan('optimize:clear')">
                    ⚡ optimize:clear
                </button>
                <button type="button" class="btn btn-secondary" onclick="executeArtisan('storage:link')">
                    📦 storage:link
                </button>
                <button type="button" class="btn btn-secondary" onclick="executeArtisan('route:list')">
                    📋 route:list
                </button>
                <button type="button" class="btn btn-secondary" onclick="executeArtisan('migrate:status')">
                    🔍 migrate:status
                </button>
                <button type="button" class="btn btn-secondary" onclick="executeArtisan('migrate --force')">
                    🐬 migrate --force
                </button>
                <button type="button" class="btn btn-secondary" onclick="executeArtisan('key:generate --show')">
                    🔑 key:generate
                </button>
                <button type="button" class="btn btn-secondary" onclick="triggerWebCron()">
                    ⏰ রিমাইন্ডার ক্রন টেস্ট
                </button>
            </div>

            <!-- Custom Command Input -->
            <div style="display: flex; gap: 10px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: 8px; padding: 0 12px; flex-grow: 1;">
                    <span style="color: var(--accent-cyan); font-family: monospace; font-size: 14px; margin-right: 8px;">php artisan</span>
                    <input type="text" id="artisanCommandInput" placeholder="যেমন: config:clear বা route:list" 
                           style="background: transparent; border: none; outline: none; color: #fff; width: 100%; font-family: monospace; font-size: 14px;"
                           onkeypress="if(event.key === 'Enter') runCustomArtisan()">
                </div>
                <button type="button" class="btn btn-primary" id="btnRunCommand" onclick="runCustomArtisan()">
                    ▶️ রান করুন
                </button>
                <button type="button" class="btn btn-secondary" onclick="clearTerminal()">
                    মুছুন
                </button>
            </div>

            <!-- Terminal Output Window -->
            <div id="terminalWindow" style="background: #050811; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 14px; min-height: 140px; max-height: 350px; overflow-y: auto; font-family: 'Consolas', 'Monaco', monospace; font-size: 13px; color: #34d399; white-space: pre-wrap; line-height: 1.5;">
$ প্রস্তুত। যেকোনো বাটনে চাপ দিন বা কমান্ড লিখে রান করুন...
            </div>
        </div>
    </div>

    <!-- 3. System Configuration & .env Editor -->
    <div class="card">
        <div class="card-header">
            <div class="card-title">
                <span>⚙️</span>
                <span>সিস্টেম কনফিগারেশন ও .env সেটিংস (.env Management)</span>
            </div>
        </div>
        <div style="padding: 24px;">
            <form action="{{ route('admin.settings.update') }}" method="POST">
                @csrf
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px;">
                    
                    <!-- AI & WhatsApp Settings -->
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 18px;">
                        <h4 style="font-size: 15px; color: #fff; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                            <span>🤖</span>
                            <span>AI ও WhatsApp কানেকশন</span>
                        </h4>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">
                                Google Gemini API Key
                            </label>
                            <div style="display: flex; gap: 8px;">
                                <input type="password" name="gemini_api_key" id="inputGeminiKey" 
                                       placeholder="{{ $config['has_gemini_key'] ? 'বর্তমান কী পরিবর্তন করতে নতুন কী লিখুন' : 'AIzaSy...' }}" 
                                       class="form-control"
                                       style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px;">
                                <button type="button" class="btn btn-secondary" onclick="togglePasswordVisibility('inputGeminiKey')" style="padding: 8px 12px;">
                                    👁️
                                </button>
                                <button type="button" class="btn btn-secondary" onclick="testGeminiKey()" style="white-space: nowrap;">
                                    🧪 টেস্ট
                                </button>
                            </div>
                            <span style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: block;">
                                Google AI Studio থেকে প্রাপ্ত কী। এটি দিয়ে স্মার্ট বাংলা রিমাইন্ডার ও চ্যাট চলে।
                            </span>
                        </div>

                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">
                                WhatsApp Bot URL (FREND_BOT_URL)
                            </label>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" name="frend_bot_url" id="inputBotUrl" value="{{ $config['frend_bot_url'] }}" 
                                       class="form-control"
                                       style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px;">
                                <button type="button" class="btn btn-secondary" onclick="testBotConnection()" style="white-space: nowrap;">
                                    🧪 টেস্ট
                                </button>
                            </div>
                            <span style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: block;">
                                লোকাল পিসির জন্য: http://127.0.0.1:3000 বা আপনার ক্লাউড/টানেল URL।
                            </span>
                        </div>

                        <div>
                            <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">
                                Bot Runner Path (FREND_BOT_PATH)
                            </label>
                            <input type="text" name="frend_bot_path" value="{{ $config['frend_bot_path'] }}" 
                                   class="form-control"
                                   style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px;">
                            <span style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: block;">
                                ডিফল্ট: whatsapp_bot_runner
                            </span>
                        </div>
                    </div>

                    <!-- MySQL Database Settings -->
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 18px;">
                        <h4 style="font-size: 15px; color: #fff; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                            <span>🐬</span>
                            <span>MySQL ডেটাবেস সংযোগ (cPanel/Local)</span>
                        </h4>

                        <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 14px;">
                            <div>
                                <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">DB Host</label>
                                <input type="text" name="db_host" value="{{ $config['db_host'] }}" 
                                       style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">DB Port</label>
                                <input type="text" name="db_port" value="{{ $config['db_port'] }}" 
                                       style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px;">
                            </div>
                        </div>

                        <div style="margin-bottom: 14px;">
                            <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">Database Name</label>
                            <input type="text" name="db_database" value="{{ $config['db_database'] }}" 
                                   style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px;">
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div>
                                <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">DB Username</label>
                                <input type="text" name="db_username" value="{{ $config['db_username'] }}" 
                                       style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">DB Password</label>
                                <input type="password" name="db_password" placeholder="পরিবর্তন না করলে খালি রাখুন" 
                                       style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px;">
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
                    <button type="submit" class="btn btn-primary" style="padding: 12px 24px;">
                        💾 সেটিংস সংরক্ষণ করুন (Save & Reload .env)
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- 4. cPanel Web Cron Job Setup -->
    <div class="card">
        <div class="card-header">
            <div class="card-title">
                <span>⏰</span>
                <span>cPanel ক্রনজব কনফিগারেশন (Scheduled Reminders)</span>
            </div>
        </div>
        <div style="padding: 20px;">
            <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 12px;">
                শেয়ার্ড হোস্টিংয়ে SSH টার্মিনাল ছাড়া নির্দিষ্ট সময়ে রিমাইন্ডার পাঠানোর জন্য cPanel-এর <strong>Cron Jobs</strong>-এ এই URL টি যুক্ত করুন:
            </p>

            <div style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
                <code id="cronUrlText" style="color: #34d399; font-size: 13px; word-break: break-all;">
                    {{ url('/cron/reminders/process') }}
                </code>
                <button type="button" class="btn btn-secondary" onclick="copyText('cronUrlText')">
                    📋 URL কপি
                </button>
            </div>

            <div style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                <code id="cronCommandText" style="color: var(--accent-cyan); font-size: 13px; word-break: break-all;">
                    * * * * * curl -s "{{ url('/cron/reminders/process') }}" >/dev/null 2>&1
                </code>
                <button type="button" class="btn btn-secondary" onclick="copyText('cronCommandText')">
                    📋 cPanel কমান্ড কপি
                </button>
            </div>
        </div>
    </div>

</div>

<script>
    const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

    // Web Artisan Runner
    async function executeArtisan(cmd) {
        const terminal = document.getElementById('terminalWindow');
        terminal.innerText += `\n\n$ php artisan ${cmd}\nপ্রসেসিং হচ্ছে...`;
        terminal.scrollTop = terminal.scrollHeight;

        try {
            const res = await fetch('{{ route("admin.settings.artisan") }}', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ command: cmd })
            });

            const data = await res.json();
            terminal.innerText += `\n${data.output}`;
        } catch (err) {
            terminal.innerText += `\n❌ এরর: ${err.message}`;
        }
        terminal.scrollTop = terminal.scrollHeight;
    }

    function runCustomArtisan() {
        const input = document.getElementById('artisanCommandInput');
        const cmd = input.value.trim();
        if (!cmd) return;
        executeArtisan(cmd);
        input.value = '';
    }

    function clearTerminal() {
        document.getElementById('terminalWindow').innerText = '$ টার্মিনাল ক্লিয়ার করা হয়েছে।';
    }

    // Live Gemini Test
    async function testGeminiKey() {
        const key = document.getElementById('inputGeminiKey').value.trim();
        alert('Gemini AI সংযোগ পরীক্ষা করা হচ্ছে...');
        try {
            const res = await fetch('{{ route("admin.settings.test-gemini") }}', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': csrfToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ api_key: key })
            });
            const data = await res.json();
            alert(data.message);
        } catch (err) {
            alert('কানেকশন টেস্ট ব্যর্থ: ' + err.message);
        }
    }

    // Live Bot Gateway Test
    async function testBotConnection() {
        alert('WhatsApp বট গেটওয়ে সংযোগ পরীক্ষা করা হচ্ছে...');
        try {
            const res = await fetch('{{ route("admin.settings.test-bot") }}', {
                method: 'POST',
                headers: {
                    'X-CSRF-TOKEN': csrfToken,
                    'Accept': 'application/json'
                }
            });
            const data = await res.json();
            alert(`বট স্ট্যাটাস: ${data.status}\nব্যবহারকারী: ${data.userName || 'N/A'}\nফোন: ${data.userPhone || 'N/A'}`);
        } catch (err) {
            alert('বট গেটওয়ে পরীক্ষা ব্যর্থ: ' + err.message);
        }
    }

    // Run Cron Trigger Live
    async function triggerWebCron() {
        const terminal = document.getElementById('terminalWindow');
        terminal.innerText += `\n\n$ GET {{ url('/cron/reminders/process') }}\nক্রনজব প্রসেস রান হচ্ছে...`;
        terminal.scrollTop = terminal.scrollHeight;

        try {
            const res = await fetch('{{ url("/cron/reminders/process") }}');
            const data = await res.json();
            terminal.innerText += `\n✅ সম্পন্ন: ${JSON.stringify(data, null, 2)}`;
        } catch (err) {
            terminal.innerText += `\n❌ এরর: ${err.message}`;
        }
        terminal.scrollTop = terminal.scrollHeight;
    }

    function togglePasswordVisibility(id) {
        const field = document.getElementById(id);
        field.type = field.type === 'password' ? 'text' : 'password';
    }

    function copyText(id) {
        const text = document.getElementById(id).innerText.trim();
        navigator.clipboard.writeText(text).then(() => {
            alert('ক্লিপবোর্ডে কপি সম্পন্ন!');
        });
    }
</script>
@endsection
