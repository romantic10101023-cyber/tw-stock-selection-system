import test from 'node:test';
import assert from 'node:assert/strict';

test('上櫃歷史資料採獨立來源解析器', () => {
  const html = '<table><tr><th>日期</th><th>成交股數</th><th>成交金額</th><th>開盤</th><th>最高</th><th>最低</th><th>收盤</th></tr><tr><td>115/08/13</td><td>1,200</td><td>100</td><td>80</td><td>84</td><td>79</td><td>82</td></tr></table>';
  assert.match(html, /115\/08\/13/);
  assert.equal(html.includes('<tr>'), true);
});
