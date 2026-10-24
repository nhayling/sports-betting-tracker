import { describe, expect, it } from 'vitest';
import { binaryWords, marketLabel, metricUnit } from '../src';

describe('marketLabel', () => {
  it.each([
    ['80+ Rushing Yards By The Player - Including Overtime', null, 'YES', '80+ rushing yards'],
    ['Total Receptions by the Player - Including Overtime', 'Puka Nacua - Over 6.5', 'OVER', 'Over 6.5 receptions'],
    ['20+ Points Scored By The Player - Including Overtime', null, 'YES', '20+ points'],
    ['3+ Three-Point Field Goals Made By The Player - Including Overtime', null, 'YES', '3+ threes'],
    ['25+ Points, Rebounds & Assists By The Player - Including Overtime', null, 'YES', '25+ points, rebounds & assists'],
    ['Points scored by the player - Including Overtime', 'Payton Pritchard - Over 15.5', 'OVER', 'Over 15.5 points'],
    ['3-point field goals made by the player - Including Overtime', 'Payton Pritchard - Under 2.5', 'UNDER', 'Under 2.5 threes'],
    ['Rebounds & Assists by the player - Including Overtime', 'Jalen Brunson - Over 9.5', 'OVER', 'Over 9.5 rebounds & assists'],
    ['To record a double-double - Including Overtime', null, 'YES', 'To record a double-double'],
    ['Total Match made Threes - Including Overtime', 'Over 28.5', 'OVER', 'Total threes (both teams)'],
  ])('%s → %s', (market, label, side, expected) => {
    expect(marketLabel(market, label, side)).toBe(expected);
  });
});

describe('basketball words', () => {
  it('names the units and the double-double outcomes', () => {
    expect(metricUnit('POINTS_REBOUNDS_ASSISTS')).toBe('pts+reb+ast');
    expect(binaryWords('DOUBLE_DOUBLE')).toEqual({ hit: 'Double-double', pending: 'Not yet', missed: 'No double-double' });
  });
});
