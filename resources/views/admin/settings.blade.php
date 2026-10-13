@extends('admin.layout')

@section('title', 'সিস্টেম সেটিংস, সেলফ-হিলিং ও আপডেট')
@section('page_title', 'সিস্টেম সেটিংস, সেলফ-হিলিং ও স্বয়ংক্রিয় আপডেট')
@section('page_subtitle', 'cPanel শেয়ার্ড হোস্টিংয়ের জন্য টার্মিনাল ছাড়া সেলফ-হিলিং, অটোনোমাস আপডেট, ডাইনামিক ফিচার এবং লোকাল অফলাইন AI নিয়ন্ত্রণ')

@section('content')
<div style="display: flex; flex-direction: column; gap: 24px;">

    <!-- 1. System Health & AI Quick Stats -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
        <div class="card" style="padding: 16px 20px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">সিস্টেম ভার্সন ও স্ট্যাটাস</div>
            <div style="font-size: 18px; font-weight: 700; color: #fff;">{{ $updateStatus['current_version'] ?? 'v2.6.0' }}</div>
            <div style="font-size: 11px; color: var(--accent-emerald); margin-top: 4px;">✅ সেলফ-হিলিং ও অটো-রিকভারি সক্রিয়</div>
        </div>

        <div class="card" style="padding: 16px 20px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">MySQL ডেটাবেস</div>
            <div style="font-size: 18px; font-weight: 700; color: {{ str_contains($dbStatus, 'CONNECTED') ? 'var(--accent-emerald)' : 'var(--accent-rose)' }};">
                {{ str_contains($dbStatus, 'CONNECTED') ? 'সংযুক্ত (Connected)' : 'বিচ্ছিন্ন' }}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">{{ $config['db_database'] }}</div>
        </div>

        <div class="card" style="padding: 16px 20px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">লোকাল অফলাইন AI ক্যাশ</div>
            <div style="font-size: 18px; font-weight: 700; color: var(--accent-cyan);">
                {{ $aiStats['offline_hits_saved'] ?? 0 }} টি কল সাশ্রয়
            </div>
            <div style="font-size: 11px; color: var(--accent-emerald); margin-top: 4px;">⚡ লাইভ API প্রেশার ~{{ $aiStats['api_reduction_percentage'] ?? 95 }}% হ্রাসকৃত</div>
        </div>

        <div class="card" style="padding: 16px 20px;">
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">ডাইনামিক ফিচারসমূহ</div>
            <div style="font-size: 18px; font-weight: 700; color: var(--accent-violet);">
                {{ $aiStats['active_dynamic_features'] ?? count($dynamicFeatures) }} টি সক্রিয়
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">মোট এক্সিকিউশন: {{ $aiStats['dynamic_feature_executions'] ?? 0 }} বার</div>
        </div>
    </div>

    <!-- 2. Self-Healing & System Auto-Recovery Control Center -->
    <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div class="card-title">
                <span>🩺</span>
                <span>স্বয়ংক্রিয় সেলফ-হিলিং ও সিস্টেম রিকভারি (Autonomous Self-Healing)</span>
            </div>
            <form action="{{ route('admin.settings.self-heal') }}" method="POST" style="margin: 0;">
                @csrf
                <button type="submit" class="btn btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                    🩺 এক ক্লিকে সেলফ-হিলিং ও ডায়াগনস্টিক চালান
                </button>
            </form>
        </div>
        <div style="padding: 20px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 16px;">
                <div style="background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 10px; padding: 14px;">
                    <div style="font-weight: 600; color: var(--accent-emerald); font-size: 14px; margin-bottom: 6px;">🛡️ স্টাক রিমাইন্ডার উদ্ধার</div>
                    <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
                        কোনো রিমাইন্ডার ক্র্যাশ বা নেটওয়ার্ক ড্রপের কারণে PROCESSING অবস্থায় আটকে থাকলে সেলফ-হিলিং স্বয়ংক্রিয়ভাবে তাকে PENDING-এ ফিরিয়ে এনে পুনরায় পাঠায়।
                    </div>
                </div>

                <div style="background: rgba(6, 182, 212, 0.05); border: 1px solid rgba(6, 182, 212, 0.2); border-radius: 10px; padding: 14px;">
                    <div style="font-weight: 600; color: var(--accent-cyan); font-size: 14px; margin-bottom: 6px;">🗄️ স্কিমা ও টেবিল অটো-রিপেয়ার</div>
                    <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
                        প্রয়োজনীয় টেবিল মুছে গেলে বা কোনো মিসিং কলাম পাওয়া গেলে সেলফ-হিলিং সার্ভিস সরাসরি মাইগ্রেশন এক্সিকিউট করে মিসিং স্কিমা ঠিক করে।
                    </div>
                </div>

                <div style="background: rgba(139, 92, 246, 0.05); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 10px; padding: 14px;">
                    <div style="font-weight: 600; color: var(--accent-violet); font-size: 14px; margin-bottom: 6px;">🧹 ক্যাশ ও মেমোরি ফ্লাশ</div>
                    <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
                        শেয়ার্ড হোস্টিংয়ে মেমোরি লিক বা ক্যাশ লক প্রতিরোধ করতে স্বয়ংক্রিয়ভাবে অকেজো টোকেন ও সাময়িক ফাইল পরিষ্কার করে।
                    </div>
                </div>
            </div>

            <!-- Recent Self-Healing Audit Logs -->
            @if(count($recentHealingLogs) > 0)
            <div style="margin-top: 14px;">
                <div style="font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 8px;">সাম্প্রতিক সেলফ-হিলিং ইভেন্ট ও লগ:</div>
                <div style="max-height: 180px; overflow-y: auto; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px;">
                    @foreach($recentHealingLogs as $log)
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px;">
                        <div>
                            <span style="color: var(--accent-emerald); font-weight: 600;">[{{ $log->category }}]</span>
                            <span style="color: var(--text-muted); margin-left: 6px;">{{ Str::limit($log->corrective_action, 80) }}</span>
                        </div>
                        <span style="color: var(--text-muted); font-size: 11px;">{{ \Carbon\Carbon::parse($log->created_at)->diffForHumans() }}</span>
                    </div>
                    @endforeach
                </div>
            </div>
            @endif
        </div>
    </div>

    <!-- 3. Autonomous Self-Update (Web & API Driven) -->
    <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div class="card-title">
                <span>🚀</span>
                <span>স্বয়ংক্রিয় সেলফ-আপডেট ইঞ্জিন (Autonomous Self-Update via API/Web)</span>
            </div>
            <div style="display: flex; gap: 8px;">
                <form action="{{ route('admin.settings.self-update') }}" method="POST" style="margin: 0;">
                    @csrf
                    <input type="hidden" name="version" value="v2.6.0">
                    <button type="submit" class="btn btn-primary" onclick="return confirm('আপনি কি নিশ্চিত যে সম্পূর্ণ সিস্টেম সেলফ-আপডেট চালাতে চান?')">
                        🚀 ওয়ান-ক্লিক সেলফ-আপডেট চালান
                    </button>
                </form>
            </div>
        </div>
        <div style="padding: 20px;">
            <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 14px;">
                cPanel শেয়ার্ড হোস্টিং বা রিমোট সার্ভারে কোনো টার্মিনাল/SSH ছাড়া সম্পূর্ণ সিস্টেম নিজে নিজেই ডাটাবেস মাইগ্রেশন সম্পন্ন করবে, ক্যাশ রিফ্রেশ করবে এবং হেলথ চেক সম্পন্ন করবে।
            </p>

            <div style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; margin-bottom: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <div style="font-size: 13px; font-weight: 600; color: #fff;">রিমোট API দিয়ে স্বয়ংক্রিয় আপডেট করার এন্ডপয়েন্ট:</div>
                        <code style="color: var(--accent-cyan); font-size: 12px;">POST {{ url('/api/system/self-update') }}</code>
                    </div>
                    <span style="font-size: 11px; color: var(--accent-emerald); background: rgba(16, 185, 129, 0.1); padding: 4px 10px; border-radius: 6px;">
                        GitHub Actions / Webhook Ready
                    </span>
                </div>
            </div>

            <!-- Recent Update History Table -->
            @if(count($recentUpdates) > 0)
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); text-align: left;">
                            <th style="padding: 8px;">ভার্সন</th>
                            <th style="padding: 8px;">টাইপ</th>
                            <th style="padding: 8px;">স্ট্যাটাস</th>
                            <th style="padding: 8px;">লগ / পরিবর্তন</th>
                            <th style="padding: 8px;">সময়</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach($recentUpdates as $u)
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 8px; font-weight: 600; color: #fff;">{{ $u->version }}</td>
                            <td style="padding: 8px;"><span style="background: rgba(6, 182, 212, 0.1); color: var(--accent-cyan); padding: 2px 8px; border-radius: 4px; font-size: 11px;">{{ strtoupper($u->update_type) }}</span></td>
                            <td style="padding: 8px;"><span style="color: {{ $u->status === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}; font-weight: 600;">{{ strtoupper($u->status) }}</span></td>
                            <td style="padding: 8px; color: var(--text-muted); font-size: 12px;">{{ $u->change_log }}</td>
                            <td style="padding: 8px; color: var(--text-muted); font-size: 11px;">{{ \Carbon\Carbon::parse($u->created_at)->diffForHumans() }}</td>
                        </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
            @endif
        </div>
    </div>

    <!-- 4. Dynamic Extensible Features & Aggressive Offline AI -->
    <div class="card">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div class="card-title">
                <span>✨</span>
                <span>ডাইনামিক ফিচার অ্যাডিশন ও অফলাইন AI নলেজ (Dynamic Features & Offline AI)</span>
            </div>
            <form action="{{ route('admin.settings.clear-ai-cache') }}" method="POST" style="margin: 0;">
                @csrf
                <button type="submit" class="btn btn-secondary" onclick="return confirm('আপনি কি লোকাল AI ক্যাশ পরিষ্কার করতে চান?')">
                    🧠 AI ক্যাশ ক্লিয়ার করুন ({{ $aiStats['cached_patterns_count'] ?? 0 }}টি এন্ট্রি)
                </button>
            </form>
        </div>
        <div style="padding: 20px;">
            <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
                বটে নতুন ফিচার যোগ করার জন্য কোনো কোড পরিবর্তন বা সার্ভার রিস্টার্টের দরকার নেই! যেকোনো কিওয়ার্ড এবং স্বয়ংক্রিয় উত্তর এখানে যুক্ত করলে বটের লোকাল অফলাইন মডেল ০ মিলিসেকেন্ডে ০ API খরচে উত্তর দেবে:
            </p>

            <!-- New Feature Addition Form -->
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 18px; margin-bottom: 24px;">
                <h4 style="font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                    <span>➕</span>
                    <span>নতুন ডাইনামিক ফিচার যোগ করুন (No Code / Instant Live)</span>
                </h4>
                <form action="{{ route('admin.settings.add-feature') }}" method="POST">
                    @csrf
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 14px;">
                        <div>
                            <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">ফিচারের নাম</label>
                            <input type="text" name="name" placeholder="যেমন: হেল্পলাইন বা অফার তথ্য" required
                                   style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">ট্রিগার কিওয়ার্ড / কথা</label>
                            <input type="text" name="keyword" placeholder="যেমন: হেল্পলাইন, hotline, সাপোর্ট" required
                                   style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px;">
                        </div>
                    </div>

                    <div style="margin-bottom: 14px;">
                        <label style="display: block; font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">
                            স্বয়ংক্রিয় উত্তর / রেসপন্স টেমপ্লেট ({NAME}, {TIME}, {DATE} ব্যবহার করা যাবে)
                        </label>
                        <textarea name="response_template" rows="3" placeholder="হেই {NAME}, আমাদের কাস্টমার কেয়ার নম্বর হলো: 01700-000000" required
                                  style="width: 100%; padding: 10px 14px; background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 8px; color: #fff; font-size: 13px;"></textarea>
                    </div>

                    <div style="display: flex; justify-content: flex-end;">
                        <button type="submit" class="btn btn-primary" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
                            ✨ নতুন ফিচার রেজিস্টার করুন
                        </button>
                    </div>
                </form>
            </div>

            <!-- Existing Dynamic Features List -->
            <div>
                <div style="font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 12px;">রেজিস্টার্ড ফিচারসমূহ:</div>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    @forelse($dynamicFeatures as $feat)
                    <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap;">
                        <div style="flex-grow: 1;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <span style="font-weight: 700; color: #fff; font-size: 14px;">{{ $feat->name }}</span>
                                <span style="background: {{ $feat->is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }}; color: {{ $feat->is_active ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                                    {{ $feat->is_active ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয় (Disabled)' }}
                                </span>
                                <span style="font-size: 11px; color: var(--accent-cyan); background: rgba(6, 182, 212, 0.1); padding: 2px 8px; border-radius: 4px;">
                                    ব্যবহৃত: {{ $feat->usage_count }} বার
                                </span>
                            </div>
                            <div style="font-size: 12px; color: var(--accent-violet); margin-bottom: 6px; font-family: monospace;">
                                ট্রিগার: {{ $feat->trigger_patterns }}
                            </div>
                            <div style="font-size: 12px; color: var(--text-muted); background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 6px; border: 1px dashed rgba(255,255,255,0.1); white-space: pre-wrap;">{{ $feat->response_template }}</div>
                        </div>

                        <div style="display: flex; gap: 6px;">
                            <form action="{{ route('admin.settings.toggle-feature', $feat->id) }}" method="POST" style="margin: 0;">
                                @csrf
                                <button type="submit" class="btn btn-secondary" style="padding: 6px 10px; font-size: 11px;">
                                    {{ $feat->is_active ? '⏸️ নিষ্ক্রিয় করুন' : '▶️ সক্রিয় করুন' }}
                                </button>
                            </form>
                            <form action="{{ route('admin.settings.delete-feature', $feat->id) }}" method="POST" style="margin: 0;">
                                @csrf
                                @method('DELETE')
                                <button type="submit" class="btn btn-secondary" style="padding: 6px 10px; font-size: 11px; color: var(--accent-rose);" onclick="return confirm('এই ফিচারটি মুছে ফেলতে চান?')">
                                    🗑️ মুছুন
                                </button>
                            </form>
                        </div>
                    </div>
                    @empty
                    <div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">কোনো ডাইনামিক ফিচার পাওয়া যায়নি। উপরের ফর্ম থেকে নতুন ফিচার যোগ করুন।</div>
                    @endforelse
                </div>
            </div>
        </div>
    </div>

    <!-- 5. Web Artisan Console (Terminal Replacement) -->
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

    <!-- 6. System Configuration & .env Editor -->
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

    <!-- 7. cPanel Web Cron Job Setup -->
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
