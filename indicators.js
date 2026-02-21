const Indicators = {
    calculateEMA(data, period) {
        const k = 2 / (period + 1);
        const emaArray = [];
        
        let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
        emaArray.push(ema);
        
        for (let i = period; i < data.length; i++) {
            ema = data[i] * k + ema * (1 - k);
            emaArray.push(ema);
        }
        
        return emaArray;
    },

    calculateSMA(data, period) {
        const smaArray = [];
        for (let i = period - 1; i < data.length; i++) {
            const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            smaArray.push(sum / period);
        }
        return smaArray;
    },

    calculateRSI(closes, period = 14) {
        if (closes.length < period + 1) return null;

        const changes = [];
        for (let i = 1; i < closes.length; i++) {
            changes.push(closes[i] - closes[i - 1]);
        }

        let avgGain = 0;
        let avgLoss = 0;

        for (let i = 0; i < period; i++) {
            if (changes[i] > 0) {
                avgGain += changes[i];
            } else {
                avgLoss += Math.abs(changes[i]);
            }
        }

        avgGain /= period;
        avgLoss /= period;

        const rsiArray = [];
        
        for (let i = period; i < changes.length; i++) {
            const change = changes[i];
            if (change > 0) {
                avgGain = (avgGain * (period - 1) + change) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            } else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
            }

            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            const rsi = 100 - (100 / (1 + rs));
            rsiArray.push(rsi);
        }

        return rsiArray.length > 0 ? rsiArray[rsiArray.length - 1] : null;
    },

    calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (closes.length < slowPeriod) return null;

        const emaFast = this.calculateEMA(closes, fastPeriod);
        const emaSlow = this.calculateEMA(closes, slowPeriod);

        const macdLine = [];
        const offset = slowPeriod - fastPeriod;
        
        for (let i = 0; i < emaSlow.length; i++) {
            macdLine.push(emaFast[i + offset] - emaSlow[i]);
        }

        if (macdLine.length < signalPeriod) return null;

        const signalLine = this.calculateEMA(macdLine, signalPeriod);
        const histogram = macdLine.slice(signalPeriod - 1).map((val, i) => val - signalLine[i]);

        return {
            macd: macdLine[macdLine.length - 1],
            signal: signalLine[signalLine.length - 1],
            histogram: histogram[histogram.length - 1],
            previousHistogram: histogram.length > 1 ? histogram[histogram.length - 2] : 0
        };
    },

    calculateATR(highs, lows, closes, period = 14) {
        if (highs.length < period + 1) return null;

        const trueRanges = [];
        
        for (let i = 1; i < highs.length; i++) {
            const tr = Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            );
            trueRanges.push(tr);
        }

        let atr = trueRanges.slice(0, period).reduce((sum, val) => sum + val, 0) / period;

        for (let i = period; i < trueRanges.length; i++) {
            atr = (atr * (period - 1) + trueRanges[i]) / period;
        }

        return atr;
    },

    getEMACrossSignal(closes, shortPeriod = 20, longPeriod = 50) {
        if (closes.length < longPeriod + 2) return { signal: 'neutral', trend: '---' };

        const shortEMA = this.calculateEMA(closes, shortPeriod);
        const longEMA = this.calculateEMA(closes, longPeriod);

        const offset = longPeriod - shortPeriod;
        const currentShort = shortEMA[shortEMA.length - 1];
        const currentLong = longEMA[longEMA.length - 1];
        const prevShort = shortEMA[shortEMA.length - 2];
        const prevLong = longEMA[longEMA.length - 2];

        if (currentShort > currentLong && prevShort <= prevLong) {
            return { signal: 'bullish', trend: '上昇転換' };
        } else if (currentShort < currentLong && prevShort >= prevLong) {
            return { signal: 'bearish', trend: '下降転換' };
        } else if (currentShort > currentLong) {
            return { signal: 'bullish', trend: '上昇トレンド' };
        } else if (currentShort < currentLong) {
            return { signal: 'bearish', trend: '下降トレンド' };
        }
        
        return { signal: 'neutral', trend: '横ばい' };
    },

    getRSISignal(rsi) {
        if (rsi === null) return { signal: 'neutral', text: '---' };
        
        if (rsi >= 70) {
            return { signal: 'bearish', text: '買われすぎ' };
        } else if (rsi <= 30) {
            return { signal: 'bullish', text: '売られすぎ' };
        } else if (rsi >= 60) {
            return { signal: 'neutral', text: '強気' };
        } else if (rsi <= 40) {
            return { signal: 'neutral', text: '弱気' };
        }
        return { signal: 'neutral', text: '中立' };
    },

    getMACDSignal(macdData) {
        if (!macdData) return { signal: 'neutral', text: '---' };

        const { histogram, previousHistogram } = macdData;

        if (histogram > 0 && previousHistogram <= 0) {
            return { signal: 'bullish', text: '買いサイン' };
        } else if (histogram < 0 && previousHistogram >= 0) {
            return { signal: 'bearish', text: '売りサイン' };
        } else if (histogram > 0) {
            return { signal: 'bullish', text: '強気継続' };
        } else if (histogram < 0) {
            return { signal: 'bearish', text: '弱気継続' };
        }
        
        return { signal: 'neutral', text: '中立' };
    },

    calculateSLTP(currentPrice, atr, isBuy, rrRatio = 2) {
        if (!atr) return null;

        const slDistance = atr * 1.5;
        const tpDistance = slDistance * rrRatio;

        if (isBuy) {
            return {
                entry: currentPrice,
                sl: currentPrice - slDistance,
                tp: currentPrice + tpDistance,
                slPips: -slDistance,
                tpPips: tpDistance
            };
        } else {
            return {
                entry: currentPrice,
                sl: currentPrice + slDistance,
                tp: currentPrice - tpDistance,
                slPips: slDistance,
                tpPips: -tpDistance
            };
        }
    },

    generateSignal(closes, highs, lows) {
        const rsi = this.calculateRSI(closes);
        const macd = this.calculateMACD(closes);
        const ema = this.getEMACrossSignal(closes);
        const atr = this.calculateATR(highs, lows, closes);

        let buyScore = 0;
        let sellScore = 0;

        const rsiSignal = this.getRSISignal(rsi);
        if (rsiSignal.signal === 'bullish') buyScore += 2;
        else if (rsiSignal.signal === 'bearish') sellScore += 2;

        const macdSignal = this.getMACDSignal(macd);
        if (macdSignal.signal === 'bullish') buyScore += 2;
        else if (macdSignal.signal === 'bearish') sellScore += 2;

        if (ema.signal === 'bullish') buyScore += 1;
        else if (ema.signal === 'bearish') sellScore += 1;

        let overallSignal = 'neutral';
        let signalText = '様子見';
        let signalIcon = '⏳';

        if (buyScore >= 3 && buyScore > sellScore) {
            overallSignal = 'buy';
            signalText = '買い';
            signalIcon = '📈';
        } else if (sellScore >= 3 && sellScore > buyScore) {
            overallSignal = 'sell';
            signalText = '売り';
            signalIcon = '📉';
        }

        return {
            overall: overallSignal,
            text: signalText,
            icon: signalIcon,
            rsi: { value: rsi, ...rsiSignal },
            macd: { value: macd?.macd, ...macdSignal },
            ema: ema,
            atr: atr,
            buyScore,
            sellScore
        };
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Indicators;
}
