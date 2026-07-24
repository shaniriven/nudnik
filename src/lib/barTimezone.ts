import { env } from '../config/env';

export interface BarTimezoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function getBarTimezoneParts(date: Date): BarTimezoneParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: env.BAR_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}
