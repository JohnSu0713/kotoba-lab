import type { ContentPack } from '../../core/contracts/content.js';
import type { KanaGroup, KanaItem, Script } from '../../domain/models.js';

interface KanaSeed { hira: string; kata: string; romaji: string; row: string; group: KanaGroup; }
const rawSeeds: Array<[string,string,string,string,KanaGroup]> = [
['あ','ア','a','vowel','gojuon'],['い','イ','i','vowel','gojuon'],['う','ウ','u','vowel','gojuon'],['え','エ','e','vowel','gojuon'],['お','オ','o','vowel','gojuon'],
['か','カ','ka','k','gojuon'],['き','キ','ki','k','gojuon'],['く','ク','ku','k','gojuon'],['け','ケ','ke','k','gojuon'],['こ','コ','ko','k','gojuon'],
['さ','サ','sa','s','gojuon'],['し','シ','shi','s','gojuon'],['す','ス','su','s','gojuon'],['せ','セ','se','s','gojuon'],['そ','ソ','so','s','gojuon'],
['た','タ','ta','t','gojuon'],['ち','チ','chi','t','gojuon'],['つ','ツ','tsu','t','gojuon'],['て','テ','te','t','gojuon'],['と','ト','to','t','gojuon'],
['な','ナ','na','n','gojuon'],['に','ニ','ni','n','gojuon'],['ぬ','ヌ','nu','n','gojuon'],['ね','ネ','ne','n','gojuon'],['の','ノ','no','n','gojuon'],
['は','ハ','ha','h','gojuon'],['ひ','ヒ','hi','h','gojuon'],['ふ','フ','fu','h','gojuon'],['へ','ヘ','he','h','gojuon'],['ほ','ホ','ho','h','gojuon'],
['ま','マ','ma','m','gojuon'],['み','ミ','mi','m','gojuon'],['む','ム','mu','m','gojuon'],['め','メ','me','m','gojuon'],['も','モ','mo','m','gojuon'],
['や','ヤ','ya','y','gojuon'],['ゆ','ユ','yu','y','gojuon'],['よ','ヨ','yo','y','gojuon'],
['ら','ラ','ra','r','gojuon'],['り','リ','ri','r','gojuon'],['る','ル','ru','r','gojuon'],['れ','レ','re','r','gojuon'],['ろ','ロ','ro','r','gojuon'],
['わ','ワ','wa','w','gojuon'],['を','ヲ','wo','w','gojuon'],['ん','ン','n','n-final','gojuon'],
['が','ガ','ga','g','dakuten'],['ぎ','ギ','gi','g','dakuten'],['ぐ','グ','gu','g','dakuten'],['げ','ゲ','ge','g','dakuten'],['ご','ゴ','go','g','dakuten'],
['ざ','ザ','za','z','dakuten'],['じ','ジ','ji','z','dakuten'],['ず','ズ','zu','z','dakuten'],['ぜ','ゼ','ze','z','dakuten'],['ぞ','ゾ','zo','z','dakuten'],
['だ','ダ','da','d','dakuten'],['ぢ','ヂ','ji','d','dakuten'],['づ','ヅ','zu','d','dakuten'],['で','デ','de','d','dakuten'],['ど','ド','do','d','dakuten'],
['ば','バ','ba','b','dakuten'],['び','ビ','bi','b','dakuten'],['ぶ','ブ','bu','b','dakuten'],['べ','ベ','be','b','dakuten'],['ぼ','ボ','bo','b','dakuten'],
['ぱ','パ','pa','p','handakuten'],['ぴ','ピ','pi','p','handakuten'],['ぷ','プ','pu','p','handakuten'],['ぺ','ペ','pe','p','handakuten'],['ぽ','ポ','po','p','handakuten'],
['きゃ','キャ','kya','ky','yoon'],['きゅ','キュ','kyu','ky','yoon'],['きょ','キョ','kyo','ky','yoon'],['しゃ','シャ','sha','sh','yoon'],['しゅ','シュ','shu','sh','yoon'],['しょ','ショ','sho','sh','yoon'],['ちゃ','チャ','cha','ch','yoon'],['ちゅ','チュ','chu','ch','yoon'],['ちょ','チョ','cho','ch','yoon'],['にゃ','ニャ','nya','ny','yoon'],['にゅ','ニュ','nyu','ny','yoon'],['にょ','ニョ','nyo','ny','yoon'],['ひゃ','ヒャ','hya','hy','yoon'],['ひゅ','ヒュ','hyu','hy','yoon'],['ひょ','ヒョ','hyo','hy','yoon'],['みゃ','ミャ','mya','my','yoon'],['みゅ','ミュ','myu','my','yoon'],['みょ','ミョ','myo','my','yoon'],['りゃ','リャ','rya','ry','yoon'],['りゅ','リュ','ryu','ry','yoon'],['りょ','リョ','ryo','ry','yoon'],['ぎゃ','ギャ','gya','gy','yoon'],['ぎゅ','ギュ','gyu','gy','yoon'],['ぎょ','ギョ','gyo','gy','yoon'],['じゃ','ジャ','ja','j','yoon'],['じゅ','ジュ','ju','j','yoon'],['じょ','ジョ','jo','j','yoon'],['びゃ','ビャ','bya','by','yoon'],['びゅ','ビュ','byu','by','yoon'],['びょ','ビョ','byo','by','yoon'],['ぴゃ','ピャ','pya','py','yoon'],['ぴゅ','ピュ','pyu','py','yoon'],['ぴょ','ピョ','pyo','py','yoon']];
const seeds: KanaSeed[] = rawSeeds.map(([hira,kata,romaji,row,group]) => ({hira,kata,romaji,row,group}));
function makeItem(seed: KanaSeed, script: Script, order: number): KanaItem { const kana=script==='hiragana'?seed.hira:seed.kata; return {id:`kana:${script}:${seed.romaji}:${seed.row}`,kind:'kana',script,kana,romaji:seed.romaji,group:seed.group,row:seed.row,pairId:`${seed.romaji}:${seed.row}`,order}; }
const items: KanaItem[]=[]; seeds.forEach((seed,index)=>{items.push(makeItem(seed,'hiragana',index)); items.push(makeItem(seed,'katakana',index+1000));});
export const kanaPack: ContentPack={id:'kana-core-ja',title:'五十音・擴充假名',description:'平假名、片假名、濁音、半濁音與拗音。',version:'1.0.0',sourceLabel:'Kotoba Lab curated core kana set',licenseLabel:'Factual character mappings; project-authored metadata',items};
