class GoldSignalApp {
    constructor() {
        this.apiKey = localStorage.getItem('twelvedata_api_key') || '';
        this.lineToken = localStorage.getItem('line_notify_token') || '';
        this.browserNotify = localStorage.getItem('browser_notify') !== 'false';
        this.lineNotifyEnabled = localStorage.getItem('line_notify_enabled') === 'true';
        this.timeframe = '15min';
        this.chart = null;
        this.candlestickSeries = null;
        this.ema20Series = null;
        this.ema50Series = null;
        this.priceData = [];
        this.lastSignal = null;
        this.history = JSON.parse(localStorage.getItem('signal_history') || '[]');
        this.updateInterval = null;
        
        this.init();
    }

    init() {
        this.setupTabs();
        this.setupEventListeners();
        this.loadSettings();
        this.renderHistory();
        
        if (this.apiKey) {
            this.startDataFetch();
        } else {
            this.showDemoMode();
        }

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(err => {
                console.log('SW registration failed:', err);
            });
        }
    }

    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                
                btn.classList.add('active');
                document.getElementById(`${tabId}-tab`).classList.add('active');
                
                if (tabId === 'chart' && !this.chart) {
                    setTimeout(() => this.initChart(), 100);
                }
            });
        });
    }

    setupEventListeners() {
        document.querySelectorAll('.tf-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.timeframe = btn.dataset.tf;
                this.fetchData();
            });
        });

        document.getElementById('browser-notify').addEventListener('change', (e) => {
            this.browserNotify = e.target.checked;
            localStorage.setItem('browser_notify', this.browserNotify);
            if (this.browserNotify) {
                this.requestNotificationPermission();
            }
        });

        document.getElementById('line-notify').addEventListener('change', (e) => {
            this.lineNotifyEnabled = e.target.checked;
            localStorage.setItem('line_notify_enabled', this.lineNotifyEnabled);
            document.getElementById('line-token-section').classList.toggle('hidden', !this.lineNotifyEnabled);
        });

        document.getElementById('save-line-token').addEventListener('click', () => {
            const token = document.getElementById('line-token').value.trim();
            if (token) {
                localStorage.setItem('line_notify_token', token);
                this.lineToken = token;
                alert('LINE Notifyトークンを保存しました');
            }
        });

        document.getElementById('test-line').addEventListener('click', () => {
            this.sendLineNotify('🥇 テスト通知\nGOLDシグナルアプリからのテストメッセージです。');
        });

        document.getElementById('save-api-key').addEventListener('click', () => {
            const key = document.getElementById('api-key').value.trim();
            if (key) {
                localStorage.setItem('twelvedata_api_key', key);
                this.apiKey = key;
                this.startDataFetch();
                alert('APIキーを保存しました');
            }
        });

        document.getElementById('clear-history').addEventListener('click', () => {
            if (confirm('履歴をクリアしますか？')) {
                this.history = [];
                localStorage.setItem('signal_history', '[]');
                this.renderHistory();
            }
        });
    }

    loadSettings() {
        document.getElementById('browser-notify').checked = this.browserNotify;
        document.getElementById('line-notify').checked = this.lineNotifyEnabled;
        
        if (this.lineNotifyEnabled) {
            document.getElementById('line-token-section').classList.remove('hidden');
        }
        
        if (this.lineToken) {
            document.getElementById('line-token').value = '••••••••••••';
        }
        
        if (this.apiKey) {
            document.getElementById('api-key').value = '••••••••••••';
        }
    }

    initChart() {
        const container = document.getElementById('chart-container');
        if (!container || this.chart) return;

        this.chart = LightweightCharts.createChart(container, {
            width: container.clientWidth,
            height: container.clientHeight || 300,
            layout: {
                background: { color: '#1c2128' },
                textColor: '#8b949e',
            },
            grid: {
                vertLines: { color: '#21262d' },
                horzLines: { color: '#21262d' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: '#30363d',
            },
            timeScale: {
                borderColor: '#30363d',
                timeVisible: true,
            },
            handleScale: {
                pinch: true,
            },
            handleScroll: {
                mouseWheel: true,
                pressedMouseMove: true,
                horzTouchDrag: true,
                vertTouchDrag: true,
            },
        });

        this.candlestickSeries = this.chart.addCandlestickSeries({
            upColor: '#3fb950',
            downColor: '#f85149',
            borderUpColor: '#3fb950',
            borderDownColor: '#f85149',
            wickUpColor: '#3fb950',
            wickDownColor: '#f85149',
        });

        this.ema20Series = this.chart.addLineSeries({
            color: '#58a6ff',
            lineWidth: 1,
        });

        this.ema50Series = this.chart.addLineSeries({
            color: '#d29922',
            lineWidth: 1,
        });

        window.addEventListener('resize', () => {
            if (this.chart && container) {
                this.chart.applyOptions({ 
                    width: container.clientWidth,
                    height: container.clientHeight || 300
                });
            }
        });

        if (this.priceData.length > 0) {
            this.updateChart();
        }
    }

    async fetchData() {
        if (!this.apiKey) {
            this.showDemoMode();
            return;
        }

        this.updateStatus('データ取得中...', false);

        try {
            const response = await fetch(
                `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${this.timeframe}&outputsize=100&apikey=${this.apiKey}`
            );
            
            const data = await response.json();
            
            if (data.status === 'error') {
                throw new Error(data.message || 'API error');
            }

            if (!data.values || data.values.length === 0) {
                throw new Error('No data received');
            }

            this.priceData = data.values.reverse().map(item => ({
                time: this.parseTime(item.datetime),
                open: parseFloat(item.open),
                high: parseFloat(item.high),
                low: parseFloat(item.low),
                close: parseFloat(item.close)
            }));

            this.updateUI();
            this.updateStatus('接続中', true);
            this.updateLastTime();

        } catch (error) {
            console.error('Fetch error:', error);
            this.updateStatus('エラー: ' + error.message, false);
            this.showDemoMode();
        }
    }

    parseTime(datetime) {
        const date = new Date(datetime);
        return Math.floor(date.getTime() / 1000);
    }

    updateUI() {
        this.updatePriceDisplay();
        this.updateChart();
        this.updateIndicators();
    }

    updatePriceDisplay() {
        if (this.priceData.length < 2) return;

        const lastCandle = this.priceData[this.priceData.length - 1];
        const prevCandle = this.priceData[this.priceData.length - 2];

        const currentPrice = lastCandle.close;
        const change = currentPrice - prevCandle.close;
        const changePercent = (change / prevCandle.close) * 100;

        document.getElementById('current-price').textContent = `$${currentPrice.toFixed(2)}`;
        
        const changeEl = document.getElementById('price-change');
        changeEl.textContent = `${change >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
        changeEl.className = `change ${change >= 0 ? 'positive' : 'negative'}`;
    }

    updateChart() {
        if (!this.chart || this.priceData.length === 0) return;

        this.candlestickSeries.setData(this.priceData);

        const closes = this.priceData.map(d => d.close);
        
        const ema20 = Indicators.calculateEMA(closes, 20);
        const ema50 = Indicators.calculateEMA(closes, 50);

        const ema20Data = ema20.map((value, i) => ({
            time: this.priceData[i + 20 - 1]?.time,
            value: value
        })).filter(d => d.time);

        const ema50Data = ema50.map((value, i) => ({
            time: this.priceData[i + 50 - 1]?.time,
            value: value
        })).filter(d => d.time);

        this.ema20Series.setData(ema20Data);
        this.ema50Series.setData(ema50Data);

        this.chart.timeScale().fitContent();
    }

    updateIndicators() {
        if (this.priceData.length < 50) return;

        const closes = this.priceData.map(d => d.close);
        const highs = this.priceData.map(d => d.high);
        const lows = this.priceData.map(d => d.low);

        const signal = Indicators.generateSignal(closes, highs, lows);

        document.getElementById('rsi-value').textContent = signal.rsi.value?.toFixed(1) || '--';
        const rsiSignalEl = document.getElementById('rsi-signal');
        rsiSignalEl.textContent = signal.rsi.text;
        rsiSignalEl.className = `badge ${signal.rsi.signal}`;

        document.getElementById('macd-value').textContent = signal.macd.value?.toFixed(2) || '--';
        const macdSignalEl = document.getElementById('macd-signal');
        macdSignalEl.textContent = signal.macd.text;
        macdSignalEl.className = `badge ${signal.macd.signal}`;

        document.getElementById('ema-value').textContent = '';
        const emaSignalEl = document.getElementById('ema-signal');
        emaSignalEl.textContent = signal.ema.trend;
        emaSignalEl.className = `badge ${signal.ema.signal}`;

        document.getElementById('atr-value').textContent = signal.atr?.toFixed(2) || '--';
        const atrSignalEl = document.getElementById('atr-signal');
        atrSignalEl.textContent = signal.atr > 10 ? '高ボラ' : '低ボラ';
        atrSignalEl.className = 'badge neutral';

        const signalDisplay = document.getElementById('signal-display');
        signalDisplay.className = `signal ${signal.overall}`;
        signalDisplay.innerHTML = `
            <span class="signal-icon">${signal.icon}</span>
            <span class="signal-text">${signal.text}</span>
        `;

        const now = new Date();
        document.getElementById('signal-time').textContent = 
            `更新: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        const currentPrice = closes[closes.length - 1];
        const isBuy = signal.overall === 'buy';
        const sltp = Indicators.calculateSLTP(currentPrice, signal.atr, isBuy);

        if (sltp && signal.overall !== 'neutral') {
            document.getElementById('entry-price').textContent = `$${sltp.entry.toFixed(2)}`;
            document.getElementById('sl-price').textContent = `$${sltp.sl.toFixed(2)}`;
            document.getElementById('tp-price').textContent = `$${sltp.tp.toFixed(2)}`;
            document.getElementById('rr-ratio').textContent = '1:2';
        } else {
            document.getElementById('entry-price').textContent = '---';
            document.getElementById('sl-price').textContent = '---';
            document.getElementById('tp-price').textContent = '---';
            document.getElementById('rr-ratio').textContent = '---';
        }

        if (this.lastSignal !== signal.overall && signal.overall !== 'neutral') {
            this.onNewSignal(signal, currentPrice, sltp);
        }
        this.lastSignal = signal.overall;
    }

    onNewSignal(signal, price, sltp) {
        this.addToHistory(signal, price, sltp);
        
        if (this.browserNotify) {
            this.sendBrowserNotification(signal);
        }
        
        if (this.lineNotifyEnabled && this.lineToken) {
            const message = this.formatLineMessage(signal, price, sltp);
            this.sendLineNotify(message);
        }
    }

    addToHistory(signal, price, sltp) {
        const entry = {
            id: Date.now(),
            type: signal.overall,
            text: signal.text,
            icon: signal.icon,
            price: price,
            sl: sltp?.sl,
            tp: sltp?.tp,
            time: new Date().toISOString(),
            result: 'pending'
        };

        this.history.unshift(entry);
        if (this.history.length > 50) {
            this.history = this.history.slice(0, 50);
        }
        
        localStorage.setItem('signal_history', JSON.stringify(this.history));
        this.renderHistory();
    }

    renderHistory() {
        const container = document.getElementById('history-list');
        
        if (this.history.length === 0) {
            container.innerHTML = '<p class="empty-message">まだ履歴がありません</p>';
            return;
        }

        container.innerHTML = this.history.map(item => {
            const date = new Date(item.time);
            const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            
            return `
                <div class="history-item" data-id="${item.id}">
                    <span class="history-icon">${item.icon}</span>
                    <div class="history-info">
                        <div class="history-signal ${item.type}">${item.text}</div>
                        <div class="history-detail">$${item.price?.toFixed(2) || '---'} | ${timeStr}</div>
                    </div>
                    <button class="history-result ${item.result}" onclick="app.toggleResult(${item.id})">
                        ${item.result === 'win' ? '勝ち' : item.result === 'loss' ? '負け' : '未定'}
                    </button>
                </div>
            `;
        }).join('');
    }

    toggleResult(id) {
        const item = this.history.find(h => h.id === id);
        if (!item) return;

        const states = ['pending', 'win', 'loss'];
        const currentIndex = states.indexOf(item.result);
        item.result = states[(currentIndex + 1) % states.length];
        
        localStorage.setItem('signal_history', JSON.stringify(this.history));
        this.renderHistory();
    }

    showDemoMode() {
        this.updateStatus('デモモード', false);
        
        const now = Math.floor(Date.now() / 1000);
        const interval = this.timeframe === '15min' ? 900 : 3600;
        
        this.priceData = [];
        let basePrice = 2045;
        
        for (let i = 99; i >= 0; i--) {
            const time = now - (i * interval);
            const volatility = Math.random() * 10 - 5;
            const trend = Math.sin(i / 10) * 3;
            
            const open = basePrice + volatility;
            const close = open + (Math.random() * 6 - 3);
            const high = Math.max(open, close) + Math.random() * 3;
            const low = Math.min(open, close) - Math.random() * 3;
            
            this.priceData.push({
                time: time,
                open: open,
                high: high,
                low: low,
                close: close
            });
            
            basePrice = close + trend * 0.1;
        }

        this.updateUI();
    }

    startDataFetch() {
        this.fetchData();
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        const intervalMs = this.timeframe === '15min' ? 60000 : 300000;
        this.updateInterval = setInterval(() => this.fetchData(), intervalMs);
    }

    updateStatus(text, isOnline) {
        const indicator = document.getElementById('api-status');
        const statusText = document.getElementById('status-text');
        
        indicator.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
        statusText.textContent = text;
    }

    updateLastTime() {
        const now = new Date();
        document.getElementById('last-update').textContent = 
            `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }

    async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }

    sendBrowserNotification(signal) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const title = signal.overall === 'buy' ? '📈 買いシグナル' : '📉 売りシグナル';
            const body = `GOLD (XAU/USD) - ${this.timeframe}足で${signal.text}シグナル`;
            
            new Notification(title, {
                body: body,
                icon: signal.icon,
                tag: 'gold-signal',
                vibrate: [200, 100, 200]
            });
        }
    }

    formatLineMessage(signal, price, sltp) {
        const emoji = signal.overall === 'buy' ? '📈' : '📉';
        const direction = signal.overall === 'buy' ? '買い' : '売り';
        
        let message = `\n🥇 GOLD ${emoji} ${direction}シグナル\n`;
        message += `━━━━━━━━━━━━━━\n`;
        message += `💰 価格: $${price.toFixed(2)}\n`;
        
        if (sltp) {
            message += `🛑 SL: $${sltp.sl.toFixed(2)}\n`;
            message += `🎯 TP: $${sltp.tp.toFixed(2)}\n`;
            message += `📊 RR比: 1:2\n`;
        }
        
        message += `⏰ ${this.timeframe}足\n`;
        message += `━━━━━━━━━━━━━━`;
        
        return message;
    }

    async sendLineNotify(message) {
        if (!this.lineToken) {
            alert('LINE Notifyトークンが設定されていません');
            return;
        }

        try {
            const response = await fetch('https://notify-api.line.me/api/notify', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.lineToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `message=${encodeURIComponent(message)}`
            });

            if (response.ok) {
                console.log('LINE notification sent');
            } else {
                const errorText = await response.text();
                console.error('LINE notify error:', errorText);
                if (response.status === 401) {
                    alert('LINE Notifyトークンが無効です。再設定してください。');
                }
            }
        } catch (error) {
            console.error('LINE notify error:', error);
        }
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new GoldSignalApp();
});
