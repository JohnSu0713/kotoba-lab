import type { JlptLevel, VocabularyItem } from '../../domain/models.js';

export interface UnitTheme {
  id: string;
  title: string;
  focus: string;
  keywords: readonly string[];
}

const n5: readonly UnitTheme[] = [
  { id: 'people-intro', title: '自己介紹與身邊的人', focus: '姓名、國籍、家人、朋友與基本人物稱呼', keywords: ['私','人','名前','日本','外国','国','家族','父','母','兄','姉','弟','妹','友達','先生','学生','子供','男','女','誰','我','人','名字','國','家人','朋友','老師','學生','孩子'] },
  { id: 'time-routine', title: '時間與一天的生活', focus: '日期、時間、早晚與每天反覆做的事', keywords: ['今日','明日','昨日','朝','昼','夜','午前','午後','時間','時','分','週','月','年','毎','起き','寝','每天','今天','明天','昨天','早上','中午','晚上','時間','星期','月份','年'] },
  { id: 'home-things', title: '家與身邊的東西', focus: '房間、家具、衣物與日常用品', keywords: ['家','部屋','机','椅子','窓','ドア','本','鉛筆','紙','服','靴','帽子','鞄','時計','写真','電話','家','房間','桌','椅','窗','門','書','衣服','鞋','帽','包','時鐘','照片','電話'] },
  { id: 'food-shopping', title: '吃飯、買東西與金錢', focus: '食物、飲料、商店、價格與數量', keywords: ['食','飲','水','ご飯','料理','店','買','売','お金','円','値段','安','高','肉','魚','野菜','果物','茶','コーヒー','食物','喝','水','飯','料理','商店','買','賣','錢','價格','便宜','貴','肉','魚','蔬菜','水果'] },
  { id: 'places-transport', title: '地點、方向與交通', focus: '去哪裡、怎麼走、搭什麼交通工具', keywords: ['駅','電車','車','自動車','バス','道','右','左','前','後','上','下','中','外','近','遠','行','来','帰','乗','降','駅','車站','電車','公車','道路','右','左','前','後','上','下','裡','外','近','遠','去','來','回'] },
  { id: 'school-work', title: '學校與工作', focus: '教室、學習、公司與簡單工作情境', keywords: ['学校','教室','先生','学生','勉強','宿題','試験','会社','仕事','働','休','会議','学校','學校','教室','老師','學生','學習','作業','考試','公司','工作','上班','休息','會議'] },
  { id: 'actions-communication', title: '最常用的動作與溝通', focus: '看、聽、說、讀、寫與日常動作', keywords: ['見','聞','話','言','読','書','使','会','待','持','作','取','置','開','閉','入','出','見','看','聽','說','讀','寫','用','見面','等待','拿','做','放','開','關','進','出'] },
  { id: 'describing-feelings', title: '描述人、事與感受', focus: '大小、新舊、好壞、喜好與身體感受', keywords: ['大き','小さ','新し','古い','いい','良い','悪い','好き','嫌い','暑','寒','忙','楽','難','易','面白','痛','大','小','新','舊','好','壞','喜歡','討厭','熱','冷','忙','快樂','難','容易','有趣','痛'] },
  { id: 'nature-leisure', title: '天氣、休閒與旅行', focus: '自然、季節、娛樂、興趣與簡單旅行', keywords: ['天気','雨','雪','風','山','川','海','花','春','夏','秋','冬','映画','音楽','旅行','写真','スポーツ','公園','天氣','雨','雪','風','山','河','海','花','春','夏','秋','冬','電影','音樂','旅行','照片','運動','公園'] },
];

const n4: readonly UnitTheme[] = [
  { id: 'daily-habits', title: '生活安排與習慣', focus: '更自然地描述每天的安排、頻率與習慣', keywords: ['習慣','予定','準備','生活','毎日','普通','いつも','時々','続','始','終','習慣','計畫','準備','生活','平常','經常','偶爾','繼續','開始','結束'] },
  { id: 'family-relations', title: '家庭、人際與邀約', focus: '家人、朋友、拜訪、邀請與相處', keywords: ['家族','親','夫','妻','友達','招待','約束','訪問','連絡','一緒','家庭','家人','丈夫','妻子','朋友','邀請','約定','拜訪','聯絡','一起'] },
  { id: 'city-services', title: '城市生活與公共服務', focus: '郵局、銀行、醫院、商店與辦事', keywords: ['郵便','銀行','病院','役所','店','受付','住所','番号','サービス','利用','郵局','銀行','醫院','政府','商店','櫃台','地址','號碼','服務','使用'] },
  { id: 'travel-movement', title: '旅行、交通與住宿', focus: '移動、換車、住宿與旅程安排', keywords: ['旅行','旅館','ホテル','予約','空港','飛行機','電車','乗換','出発','到着','旅行','旅館','飯店','預約','機場','飛機','電車','轉車','出發','抵達'] },
  { id: 'health-body', title: '身體、健康與照顧', focus: '身體狀況、看病、休息與健康習慣', keywords: ['体','病気','病院','薬','熱','風邪','痛','健康','治','休','身體','生病','醫院','藥','發燒','感冒','痛','健康','治療','休息'] },
  { id: 'study-work', title: '學習、能力與工作', focus: '學習方法、能力、工作任務與成長', keywords: ['勉強','練習','覚','忘','説明','仕事','会社','働','経験','上手','下手','學習','練習','記得','忘記','說明','工作','公司','上班','經驗','擅長','不擅長'] },
  { id: 'feelings-opinions', title: '感情、意見與比較', focus: '喜好、情緒、比較與簡單意見', keywords: ['気持','思','考','好き','嫌','心配','安心','比','同じ','違','感覺','想','考慮','喜歡','討厭','擔心','放心','比較','相同','不同'] },
  { id: 'plans-experience', title: '經驗、計畫與未來', focus: '曾經做過、打算做、希望與可能性', keywords: ['経験','予定','計画','将来','夢','希望','決','変','可能','必要','經驗','預定','計畫','未來','夢想','希望','決定','改變','可能','需要'] },
];

const n3: readonly UnitTheme[] = [
  { id:'relations', title:'人際關係與互動', focus:'朋友、同事、相處與關係變化', keywords:['関係','友人','同僚','仲','付き合','相手','關係','朋友','同事','相處','對方'] },
  { id:'personality', title:'性格、情緒與內心', focus:'性格、情緒、壓力與心理狀態', keywords:['性格','気分','感情','不安','緊張','安心','悩','性格','心情','感情','不安','緊張','放心','煩惱'] },
  { id:'workplace', title:'職場與任務', focus:'工作流程、責任、報告與協作', keywords:['職場','仕事','担当','責任','報告','連絡','相談','作業','職場','工作','負責','責任','報告','聯絡','商量','作業'] },
  { id:'learning', title:'學習與能力提升', focus:'學習方法、理解、記憶與能力', keywords:['学習','勉強','理解','知識','能力','覚','身につ','學習','理解','知識','能力','記憶','掌握'] },
  { id:'city', title:'城市與公共生活', focus:'公共設施、住居、城市與地方生活', keywords:['地域','市','町','公共','施設','住宅','近所','地方','地區','城市','公共','設施','住宅','鄰居','地方'] },
  { id:'travel', title:'旅行、住宿與移動', focus:'旅程、交通、住宿與意外狀況', keywords:['旅行','観光','宿泊','交通','移動','到着','出発','旅行','觀光','住宿','交通','移動','抵達','出發'] },
  { id:'health', title:'健康、醫療與身體', focus:'症狀、健康、醫療與恢復', keywords:['健康','病気','症状','治療','医者','患者','回復','健康','疾病','症狀','治療','醫生','患者','恢復'] },
  { id:'food', title:'飲食、料理與消費', focus:'食材、料理、餐廳與消費選擇', keywords:['食事','料理','食材','味','店','注文','商品','消費','飲食','料理','食材','味道','商店','點餐','商品','消費'] },
  { id:'media', title:'媒體、網路與資訊', focus:'新聞、網路、資訊與溝通工具', keywords:['情報','ニュース','記事','ネット','サイト','放送','連絡','資訊','新聞','文章','網路','網站','播送','聯絡'] },
  { id:'environment', title:'自然、天氣與環境', focus:'自然現象、環境問題與季節變化', keywords:['自然','環境','天気','気温','地球','植物','動物','自然','環境','天氣','氣溫','地球','植物','動物'] },
  { id:'safety', title:'事故、安全與問題處理', focus:'事故、危險、故障與解決問題', keywords:['事故','危険','安全','故障','問題','原因','解決','事故','危險','安全','故障','問題','原因','解決'] },
  { id:'change', title:'變化、進展與結果', focus:'變化、增加減少、進展與結果', keywords:['変化','増','減','進','結果','状態','変わ','變化','增加','減少','進展','結果','狀態'] },
  { id:'choice', title:'選擇、判斷與決定', focus:'比較選項、判斷、決定與立場', keywords:['選','判断','決定','比','意見','立場','選擇','判斷','決定','比較','意見','立場'] },
  { id:'cause', title:'原因、理由與結果', focus:'說明原因、影響與前後關係', keywords:['理由','原因','影響','結果','ため','せい','理由','原因','影響','結果'] },
  { id:'communication', title:'說明、傳達與理解', focus:'說明、通知、確認與理解他人', keywords:['説明','伝','知らせ','確認','理解','意味','說明','傳達','通知','確認','理解','意思'] },
  { id:'memory', title:'經驗、回憶與過去', focus:'回憶、經驗、曾經與過去事件', keywords:['経験','記憶','思い出','昔','過去','経験','經驗','記憶','回憶','以前','過去'] },
  { id:'society', title:'社會與日常制度', focus:'社會、規則、制度與公共議題', keywords:['社会','制度','規則','法律','政治','社会','社會','制度','規則','法律','政治'] },
  { id:'culture', title:'文化、娛樂與興趣', focus:'文化、藝術、活動與休閒', keywords:['文化','芸術','映画','音楽','趣味','活動','文化','藝術','電影','音樂','興趣','活動'] },
  { id:'quantity', title:'數量、程度與比較', focus:'程度、比例、數量與差異', keywords:['程度','割合','量','数','以上','以下','約','程度','比例','數量','以上','以下','大約'] },
  { id:'process', title:'時間、順序與流程', focus:'先後、期間、進行與完成', keywords:['期間','途中','順番','最初','最後','続','期間','途中','順序','最初','最後','繼續'] },
  { id:'n3-integration', title:'N3 綜合表達', focus:'把中級詞彙連成自然段落與意見', keywords:['つまり','例えば','一方','実際','特に','つまり','例如','另一方面','實際','特別'] },
];

const n2: readonly UnitTheme[] = [
  { id:'professional-relations', title:'職場關係與專業溝通', focus:'協作、角色、立場與專業互動', keywords:['職場','担当','上司','部下','協力','連携','職場','負責','主管','下屬','合作','協作'] },
  { id:'projects', title:'專案、進度與執行', focus:'計畫、進度、調整、完成與風險', keywords:['計画','進捗','実施','調整','完了','遅れ','計畫','進度','執行','調整','完成','延誤'] },
  { id:'business', title:'商業、交易與顧客', focus:'企業、契約、商品、顧客與交易', keywords:['企業','契約','商品','顧客','取引','販売','企業','合約','商品','客戶','交易','銷售'] },
  { id:'economy', title:'經濟、價格與市場', focus:'經濟、市場、價格、收入與成本', keywords:['経済','市場','価格','収入','費用','利益','經濟','市場','價格','收入','費用','利益'] },
  { id:'society', title:'社會結構與公共議題', focus:'人口、社會、福利、差距與制度', keywords:['社会','人口','福祉','格差','制度','地域','社會','人口','福利','差距','制度','地區'] },
  { id:'law', title:'規範、法律與責任', focus:'法律、規定、權利、義務與責任', keywords:['法律','規定','権利','義務','責任','違反','法律','規定','權利','義務','責任','違反'] },
  { id:'politics', title:'政策、行政與公共決策', focus:'政策、行政、政府與公共選擇', keywords:['政策','行政','政府','国会','選挙','公共','政策','行政','政府','國會','選舉','公共'] },
  { id:'science', title:'科學、技術與研究', focus:'研究、數據、技術、實驗與發現', keywords:['研究','科学','技術','実験','データ','発見','研究','科學','技術','實驗','數據','發現'] },
  { id:'environment', title:'環境、能源與永續', focus:'環境、能源、資源、污染與永續', keywords:['環境','エネルギー','資源','汚染','温暖化','環境','能源','資源','污染','暖化'] },
  { id:'healthcare', title:'醫療、健康與照護', focus:'醫療制度、治療、症狀與照護', keywords:['医療','治療','症状','患者','健康','介護','醫療','治療','症狀','患者','健康','照護'] },
  { id:'education', title:'教育、訓練與能力', focus:'教育制度、培訓、能力與評價', keywords:['教育','指導','訓練','能力','評価','学習','教育','指導','訓練','能力','評價','學習'] },
  { id:'media', title:'媒體、報導與資訊判讀', focus:'新聞、報導、資訊來源與觀點', keywords:['報道','記事','情報','メディア','取材','発表','報導','文章','資訊','媒體','採訪','發表'] },
  { id:'culture', title:'文化、藝術與創作', focus:'文化、藝術、作品、表現與創作', keywords:['文化','芸術','作品','表現','創作','伝統','文化','藝術','作品','表現','創作','傳統'] },
  { id:'human-behavior', title:'心理、行為與動機', focus:'心理、行為、動機、態度與反應', keywords:['心理','行動','動機','態度','反応','意識','心理','行為','動機','態度','反應','意識'] },
  { id:'relationships', title:'人際衝突與協調', focus:'誤解、衝突、信任、妥協與協調', keywords:['誤解','対立','信頼','妥協','協調','関係','誤解','對立','信任','妥協','協調','關係'] },
  { id:'risk', title:'風險、事故與應對', focus:'風險、危機、事故、防止與應對', keywords:['危機','危険','事故','防止','対策','対応','危機','危險','事故','防止','對策','應對'] },
  { id:'change', title:'趨勢、變化與發展', focus:'趨勢、成長、衰退、變革與發展', keywords:['傾向','成長','減少','変革','発展','変化','趨勢','成長','減少','變革','發展','變化'] },
  { id:'analysis', title:'分析、比較與評估', focus:'分析、比較、基準、評估與結論', keywords:['分析','比較','基準','評価','結果','結論','分析','比較','基準','評估','結果','結論'] },
  { id:'argument', title:'主張、理由與論證', focus:'主張、根據、理由、反論與論證', keywords:['主張','根拠','理由','反論','論','指摘','主張','根據','理由','反駁','論證','指出'] },
  { id:'formal-language', title:'正式表達與書面語', focus:'公告、正式書面語與抽象表達', keywords:['正式','文書','通知','記載','述べ','示す','正式','文件','通知','記載','陳述','顯示'] },
  { id:'nuance', title:'近義詞與語氣差異', focus:'近義表達、程度、語氣與細微差異', keywords:['微妙','程度','ニュアンス','わずか','かなり','多少','細微','程度','語氣','稍微','相當','多少'] },
  { id:'n2-integration', title:'N2 綜合理解與表達', focus:'把抽象詞彙用在長句、文章與意見中', keywords:['一方','一方で','したがって','なお','もっとも','另一方面','因此','此外','不過'] },
];

const n1: readonly UnitTheme[] = [
  { id:'leadership', title:'領導、組織與權責', focus:'組織運作、領導、權責與治理', keywords:['組織','指導','権限','責任','統率','運営','組織','領導','權限','責任','管理'] },
  { id:'strategy', title:'策略、方針與決策', focus:'策略、方針、優先順序與重大決策', keywords:['戦略','方針','決定','優先','判断','施策','策略','方針','決策','優先','判斷'] },
  { id:'management', title:'管理、制度與執行', focus:'管理制度、執行、監督與改善', keywords:['管理','制度','実施','監督','改善','運用','管理','制度','執行','監督','改善','運作'] },
  { id:'finance', title:'財務、投資與資本', focus:'財務、投資、資產、收益與風險', keywords:['金融','投資','資産','収益','損失','資本','財務','投資','資產','收益','損失','資本'] },
  { id:'macro-economy', title:'總體經濟與產業', focus:'景氣、產業、需求、供給與結構', keywords:['景気','産業','需要','供給','構造','経済','景氣','產業','需求','供給','結構','經濟'] },
  { id:'labor', title:'勞動、雇用與職涯', focus:'雇用、勞動、人才、待遇與職涯', keywords:['雇用','労働','人材','待遇','職','採用','雇用','勞動','人才','待遇','職涯','招聘'] },
  { id:'law-advanced', title:'法律、司法與規制', focus:'法律、司法、規制、權利與爭議', keywords:['司法','規制','権利','訴訟','違法','法案','司法','規範','權利','訴訟','違法','法案'] },
  { id:'governance', title:'政治、治理與政策', focus:'治理、政策、議會、行政與權力', keywords:['政治','政策','議会','行政','政権','統治','政治','政策','議會','行政','政權','治理'] },
  { id:'international', title:'國際關係與外交', focus:'外交、國際合作、衝突與條約', keywords:['外交','国際','協定','条約','紛争','交渉','外交','國際','協定','條約','衝突','談判'] },
  { id:'demographics', title:'人口、家庭與社會變遷', focus:'人口、少子高齡、家庭與社會變化', keywords:['人口','少子','高齢','世帯','家庭','社会','人口','少子','高齡','家庭','社會'] },
  { id:'welfare', title:'福利、醫療與社會保障', focus:'福利、社保、醫療、照護與公共支援', keywords:['福祉','保障','医療','介護','支援','保険','福利','保障','醫療','照護','支援','保險'] },
  { id:'ethics', title:'倫理、價值與責任', focus:'倫理、價值、道德、責任與判斷', keywords:['倫理','価値','道徳','責任','善悪','良心','倫理','價值','道德','責任','善惡','良心'] },
  { id:'philosophy', title:'思想、哲學與世界觀', focus:'思想、哲學、存在、觀念與世界觀', keywords:['思想','哲学','存在','概念','観念','本質','思想','哲學','存在','概念','觀念','本質'] },
  { id:'psychology', title:'心理、認知與意識', focus:'認知、意識、感情、記憶與心理', keywords:['認知','意識','感情','記憶','心理','無意識','認知','意識','感情','記憶','心理'] },
  { id:'behavior', title:'行為、傾向與動機', focus:'行為模式、傾向、動機與選擇', keywords:['行動','傾向','動機','選択','態度','習性','行為','趨勢','動機','選擇','態度'] },
  { id:'education-advanced', title:'教育制度與學術', focus:'教育、學術、研究、知識與培養', keywords:['教育','学術','研究','知識','育成','専門','教育','學術','研究','知識','培養','專業'] },
  { id:'research', title:'研究方法與證據', focus:'證據、假設、驗證、資料與方法', keywords:['根拠','仮説','検証','データ','手法','調査','證據','假設','驗證','數據','方法','調查'] },
  { id:'science-advanced', title:'科學、現象與原理', focus:'科學現象、機制、理論與原理', keywords:['科学','現象','仕組み','理論','原理','物質','科學','現象','機制','理論','原理','物質'] },
  { id:'technology', title:'技術、數位與創新', focus:'技術、數位、系統、創新與應用', keywords:['技術','デジタル','システム','革新','開発','応用','技術','數位','系統','創新','開發','應用'] },
  { id:'ai-information', title:'資訊、資料與智慧化', focus:'資訊、資料、演算法、自動化與判斷', keywords:['情報','データ','自動','処理','分析','知能','資訊','數據','自動','處理','分析','智能'] },
  { id:'environment-advanced', title:'氣候、環境與資源', focus:'氣候、環境、資源、能源與生態', keywords:['気候','環境','資源','エネルギー','生態','温暖化','氣候','環境','資源','能源','生態','暖化'] },
  { id:'disaster', title:'災害、防災與復原', focus:'災害、風險、防災、復原與韌性', keywords:['災害','防災','復旧','被害','避難','危機','災害','防災','復原','損害','避難','危機'] },
  { id:'medicine', title:'醫學、生命與健康', focus:'醫學、疾病、生命、治療與研究', keywords:['医学','疾患','生命','治療','臨床','患者','醫學','疾病','生命','治療','臨床','患者'] },
  { id:'media-advanced', title:'媒體、輿論與傳播', focus:'媒體、輿論、傳播、報導與影響', keywords:['メディア','世論','報道','発信','伝達','影響','媒體','輿論','報導','傳播','影響'] },
  { id:'language', title:'語言、修辭與表達', focus:'語言、表現、修辭、語感與解讀', keywords:['言語','表現','比喩','文脈','語感','解釈','語言','表達','比喻','語境','語感','解讀'] },
  { id:'literature', title:'文學、敘事與作品', focus:'文學、作品、敘事、作者與描寫', keywords:['文学','作品','物語','作者','描写','小説','文學','作品','故事','作者','描寫','小說'] },
  { id:'arts', title:'藝術、審美與創作', focus:'藝術、審美、創作、設計與表現', keywords:['芸術','美','創作','デザイン','表現','鑑賞','藝術','美學','創作','設計','表現','欣賞'] },
  { id:'history', title:'歷史、時代與變遷', focus:'歷史、時代、事件、傳統與變遷', keywords:['歴史','時代','事件','伝統','変遷','近代','歷史','時代','事件','傳統','變遷','近代'] },
  { id:'culture-identity', title:'文化、身份與社群', focus:'文化、身份、價值與社群認同', keywords:['文化','社会','民族','地域','価値観','共同体','文化','社會','民族','地區','價值觀','共同體'] },
  { id:'urbanism', title:'城市、空間與基礎建設', focus:'城市、建設、交通、住宅與空間', keywords:['都市','建設','交通','住宅','空間','整備','城市','建設','交通','住宅','空間','建設'] },
  { id:'agriculture-food', title:'農業、食品與供應', focus:'農業、生產、食品、供應與安全', keywords:['農業','生産','食品','供給','安全','輸入','農業','生產','食品','供應','安全','進口'] },
  { id:'industry', title:'製造、產業與供應鏈', focus:'製造、生產、物流、品質與產業', keywords:['製造','生産','物流','品質','工場','産業','製造','生產','物流','品質','工廠','產業'] },
  { id:'consumer', title:'消費、品牌與市場行為', focus:'消費、品牌、需求、選擇與市場心理', keywords:['消費','商品','ブランド','需要','購買','市場','消費','商品','品牌','需求','購買','市場'] },
  { id:'risk-advanced', title:'風險、不確定性與危機', focus:'風險、概率、不確定性與危機管理', keywords:['リスク','確率','不確実','危機','損害','予測','風險','機率','不確定','危機','損害','預測'] },
  { id:'negotiation', title:'協商、衝突與妥協', focus:'協商、爭議、衝突、妥協與共識', keywords:['交渉','対立','妥協','合意','争い','調整','協商','對立','妥協','共識','爭議','協調'] },
  { id:'evaluation', title:'評價、基準與品質', focus:'評價、基準、品質、成果與衡量', keywords:['評価','基準','品質','成果','測定','水準','評價','基準','品質','成果','衡量','水準'] },
  { id:'causality', title:'因果、條件與推論', focus:'因果、條件、推論、前提與結論', keywords:['因果','条件','推論','前提','結論','結果','因果','條件','推論','前提','結論','結果'] },
  { id:'contrast', title:'對比、讓步與細微差異', focus:'對比、讓步、例外與細微差異', keywords:['対照','一方','反面','例外','にもかかわらず','差異','對比','另一方面','反面','例外','儘管'] },
  { id:'abstract-argument', title:'抽象論述與高階連接', focus:'長篇論述、抽象概念與邏輯連接', keywords:['論理','抽象','概念','論点','前述','以上','邏輯','抽象','概念','論點','上述','以上'] },
  { id:'n1-integration', title:'N1 綜合精準表達', focus:'整合高階詞彙、語氣、文體與論述能力', keywords:['総合','精密','適切','的確','端的','総じて','綜合','精準','適當','確切','簡潔','總體'] },
];

export const THEMES_BY_LEVEL: Readonly<Record<JlptLevel, readonly UnitTheme[]>> = {
  N5: n5,
  N4: n4,
  N3: n3,
  N2: n2,
  N1: n1,
};

function searchable(item: VocabularyItem): string {
  return [
    item.expression,
    item.reading,
    ...item.meaningsZhTw,
    ...(item.partsOfSpeech ?? []),
    ...(item.fields ?? []),
  ].join(' ').toLowerCase();
}

function score(item: VocabularyItem, theme: UnitTheme): number {
  const haystack = searchable(item);
  let total = 0;
  for (const keyword of theme.keywords) {
    const value = keyword.toLowerCase();
    if (!value) continue;
    if (item.expression.includes(keyword) || item.reading.includes(keyword)) total += 7;
    if (item.meaningsZhTw.some((meaning) => meaning.toLowerCase().includes(value))) total += 4;
    if (haystack.includes(value)) total += 1;
  }
  return total;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function assignVocabularyToThemes(
  items: VocabularyItem[],
  themes: readonly UnitTheme[],
  capacities: readonly number[],
): VocabularyItem[][] {
  if (themes.length !== capacities.length) {
    throw new Error('Theme/capacity mismatch');
  }

  const buckets = themes.map(() => [] as VocabularyItem[]);
  const scored = items.map((item) => ({
    item,
    scores: themes.map((theme) => score(item, theme)),
  })).sort((a, b) => {
    const aBest = Math.max(...a.scores);
    const bBest = Math.max(...b.scores);
    if (aBest !== bBest) return bBest - aBest;
    if (a.item.common !== b.item.common) return a.item.common ? -1 : 1;
    const af = a.item.frequencyRank ?? Number.MAX_SAFE_INTEGER;
    const bf = b.item.frequencyRank ?? Number.MAX_SAFE_INTEGER;
    return af - bf || a.item.order - b.item.order || a.item.id.localeCompare(b.item.id);
  });

  for (const candidate of scored) {
    const available = themes
      .map((_, index) => index)
      .filter((index) => buckets[index]!.length < (capacities[index] ?? 0));
    if (!available.length) throw new Error('No theme capacity remaining');

    const bestScore = Math.max(...available.map((index) => candidate.scores[index] ?? 0));
    let chosen: number;
    if (bestScore > 0) {
      chosen = available
        .filter((index) => candidate.scores[index] === bestScore)
        .sort((a, b) => {
          const ar = buckets[a]!.length / Math.max(1, capacities[a] ?? 1);
          const br = buckets[b]!.length / Math.max(1, capacities[b] ?? 1);
          return ar - br || a - b;
        })[0]!;
    } else {
      const start = stableHash(candidate.item.id) % themes.length;
      chosen = available
        .map((index) => ({
          index,
          fill: buckets[index]!.length / Math.max(1, capacities[index] ?? 1),
          distance: (index - start + themes.length) % themes.length,
        }))
        .sort((a, b) => a.fill - b.fill || a.distance - b.distance || a.index - b.index)[0]!.index;
    }
    buckets[chosen]!.push(candidate.item);
  }

  for (const bucket of buckets) {
    bucket.sort((a, b) => {
      if (a.common !== b.common) return a.common ? -1 : 1;
      const af = a.frequencyRank ?? Number.MAX_SAFE_INTEGER;
      const bf = b.frequencyRank ?? Number.MAX_SAFE_INTEGER;
      return af - bf || a.order - b.order || a.id.localeCompare(b.id);
    });
  }
  return buckets;
}

for (const [level, themes] of Object.entries(THEMES_BY_LEVEL)) {
  const expected = ({ N5: 9, N4: 8, N3: 21, N2: 22, N1: 40 } as Record<string, number>)[level];
  if (themes.length !== expected) {
    throw new Error(`${level} theme count ${themes.length} does not match ${expected}`);
  }
}
