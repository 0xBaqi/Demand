import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderDemandCard} from '../src/demand-card.js';

const creator='0x1111111111111111111111111111111111111111';
const supplier='0x2222222222222222222222222222222222222222';
function render(status,account=creator,overrides={}){
  return renderDemandCard({demandId:1,decimals:6,now:1000,account,contribution:1000000n,offers:new Map(),demand:{creator,supplier,status,target:100000000n,totalCommitted:73000000n,escrow:73000000n,deadline:2000,metadata:'Laundry pickup',...overrides}});
}
test('open card uses actual remaining capital and exposes backing',()=>{
  const card=render(0);
  assert.match(card,/27 USDG more summons supply/);
  assert.match(card,/data-action="back"/);
  assert.match(card,/max="27"/);
  assert.doesNotMatch(card,/backer count/i);
});
test('funded cards expose offers and restrict acceptance to creator',()=>{
  assert.match(render(1),/data-action="offer"/);
  assert.match(render(1),/data-action="accept"/);
  assert.doesNotMatch(render(1,supplier),/data-action="accept"/);
});
test('supplier delivery and creator payment controls preserve their roles',()=>{
  assert.match(render(2,supplier),/data-action="fulfill"/);
  assert.doesNotMatch(render(2,creator),/data-action="fulfill"/);
  assert.match(render(3,creator),/data-action="settle"/);
  assert.doesNotMatch(render(3,supplier),/data-action="settle"/);
  assert.match(render(4),/Delivered & paid/);
  assert.doesNotMatch(render(4),/data-action="(back|settle|refund)"/);
});
test('expiry exposes exact reclaim amount without treating accepted demand as expired',()=>{
  assert.match(render(0,creator,{deadline:900}),/Claim back 1 USDG/);
  assert.doesNotMatch(render(2,creator,{deadline:900}),/data-action="refund"/);
});
test('public metadata is escaped instead of interpreted as HTML',()=>{
  assert.match(render(0,creator,{metadata:'<script>bad()<\/script>'}),/&lt;script&gt;/);
  assert.doesNotMatch(render(0,creator,{metadata:'<script>bad()<\/script>'}),/<script>/);
});
