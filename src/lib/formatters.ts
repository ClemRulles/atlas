export function formatMoney(value: number, currency: 'EUR' | 'USD' = 'EUR', decimals = 2): string {
  const symbol = currency === 'USD' ? '$' : '€';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return value < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

export function formatSignedMoney(value: number, currency: 'EUR' | 'USD' = 'EUR', decimals = 2): string {
  const symbol = currency === 'USD' ? '$' : '€';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return value >= 0 ? `+${symbol}${formatted}` : `-${symbol}${formatted}`;
}

export function formatNumber(value: number, maxDecimals = 4): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}
