import httpx
import asyncio
import json

async def test():
    async with httpx.AsyncClient(timeout=30.0) as c:
        r = await c.get(
            'https://query1.finance.yahoo.com/v8/finance/chart/2330.TW',
            params={'period1': 1718064000, 'period2': 1750464000, 'interval': '1d'}
        )
        print('Status:', r.status_code)
        data = r.json()
        print('Keys:', list(data.keys()))
        chart = data.get('chart', {})
        print('Result count:', len(chart.get('result', [])))
        print('Error:', chart.get('error'))
        if chart.get('result'):
            result = chart['result'][0]
            print('Timestamps:', len(result.get('timestamp', [])))
            indicators = result.get('indicators', {})
            quote = indicators.get('quote', [{}])[0]
            print('Open keys:', list(quote.keys())[:5])
            if 'open' in quote:
                print('First open:', quote['open'][0] if quote['open'] else None)

asyncio.run(test())
