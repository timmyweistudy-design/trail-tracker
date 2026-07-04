// 各語言關鍵詞人工校正：修 MT 對短 UI 詞、專有用語、天氣、星期、寵物階段的誤譯。
import fs from "fs";

const FIX = {
  ko: {
    "探索": "탐색", "記錄": "기록", "夥伴": "파트너", "社群": "커뮤니티", "我的": "내 정보",
    "儲存": "저장", "儲存中…": "저장 중…", "儲存失敗": "저장 실패", "取消": "취소", "關閉": "닫기",
    "確定": "확인", "刪除": "삭제", "編輯": "편집", "了解了": "확인", "略過": "건너뛰기", "下一步": "다음",
    "重試": "다시 시도", "清除": "지우기", "載入中…": "불러오는 중…", "載入更多": "더 보기",
    "篩選": "필터", "篩選與排序": "필터 및 정렬", "列表": "목록", "地圖": "지도", "附近": "근처",
    "難度": "난이도", "地區": "지역", "主題": "테마", "排序": "정렬", "名稱": "이름", "搜尋": "검색",
    "收藏": "즐겨찾기", "全部": "전체", "步道": "등산로", "長度": "거리", "預估時間": "예상 시간",
    "輕鬆": "쉬움", "一般": "보통", "進階": "중급", "挑戰": "상급", "困難": "어려움", "雪季": "설산",
    "追蹤": "팔로우", "已追蹤": "팔로잉", "粉絲": "팔로워", "追蹤中": "팔로잉", "貼文": "게시물",
    "留言": "댓글", "讚": "좋아요", "分享": "공유", "通知": "알림", "揪團": "모임", "發布": "게시",
    "重新整理": "새로고침", "剛剛": "방금", "今天": "오늘", "回覆": "답글",
    "步數": "걸음 수", "大卡": "kcal", "距離": "거리", "時間": "시간", "爬升": "오르막", "下降": "내리막",
    "海拔": "고도", "天氣": "날씨", "美食": "맛집", "景點": "명소", "相片": "사진", "足跡": "발자취",
    "每日任務": "일일 미션", "成就勳章": "업적", "活力": "기력", "親密度": "친밀도", "準備": "준비",
    "小隊": "팀", "隊友": "팀원", "隊長": "팀장", "翻譯年糕": "번역", "免費": "무료", "無限": "무제한",
    "升級 Premium": "프리미엄 업그레이드", "離線地圖": "오프라인 지도", "雲端備份": "클라우드 백업",
    "晴": "맑음", "多雲": "구름 많음", "陰": "흐림", "小雨": "약한 비", "中雨": "비", "大雨": "폭우",
    "陣雨": "소나기", "雷雨": "뇌우", "霧": "안개", "晴時多雲": "맑고 구름 조금",
    "日": "일", "一": "월", "二": "화", "三": "수", "四": "목", "五": "금", "六": "토",
    "神秘之卵": "신비한 알", "翩翩彩蝶": "나비", "山林猛虎": "산호랑이", "騰雲神龍": "구름 용",
    "語言 Language": "언어", "自由路線": "자유 경로",
  },
  fr: {
    "探索": "Explorer", "記錄": "Suivi", "夥伴": "Compagnon", "社群": "Communauté", "我的": "Profil",
    "儲存": "Enregistrer", "取消": "Annuler", "關閉": "Fermer", "確定": "OK", "刪除": "Supprimer",
    "編輯": "Modifier", "略過": "Passer", "下一步": "Suivant", "重試": "Réessayer", "清除": "Effacer",
    "篩選": "Filtrer", "列表": "Liste", "地圖": "Carte", "附近": "À proximité", "難度": "Difficulté",
    "地區": "Région", "主題": "Thème", "排序": "Trier", "名稱": "Nom", "搜尋": "Rechercher",
    "收藏": "Favoris", "全部": "Tout", "步道": "Sentier", "長度": "Distance", "預估時間": "Durée estimée",
    "輕鬆": "Facile", "一般": "Modéré", "進階": "Avancé", "挑戰": "Difficile", "困難": "Ardu", "雪季": "Saison neige",
    "追蹤": "Suivre", "已追蹤": "Abonné", "粉絲": "Abonnés", "追蹤中": "Abonnements", "貼文": "Publication",
    "留言": "Commentaire", "讚": "J'aime", "分享": "Partager", "通知": "Notifications", "揪團": "Sorties",
    "發布": "Publier", "重新整理": "Actualiser", "剛剛": "À l'instant", "今天": "Aujourd'hui", "回覆": "Répondre",
    "步數": "Pas", "大卡": "kcal", "距離": "Distance", "時間": "Temps", "爬升": "Dénivelé+", "下降": "Dénivelé-",
    "海拔": "Altitude", "天氣": "Météo", "美食": "Restaurants", "景點": "Sites", "相片": "Photos", "足跡": "Traces",
    "每日任務": "Missions du jour", "成就勳章": "Succès", "活力": "Énergie", "親密度": "Complicité", "準備": "Prêt",
    "小隊": "Équipe", "隊友": "Coéquipiers", "隊長": "Chef d'équipe", "翻譯年糕": "Traduire", "免費": "Gratuit",
    "無限": "Illimité", "升級 Premium": "Passer à Premium", "離線地圖": "Cartes hors ligne", "雲端備份": "Sauvegarde cloud",
    "晴": "Ensoleillé", "多雲": "Nuageux", "陰": "Couvert", "小雨": "Pluie légère", "中雨": "Pluie", "大雨": "Forte pluie",
    "陣雨": "Averses", "雷雨": "Orages", "霧": "Brouillard", "晴時多雲": "Éclaircies",
    "日": "Dim", "一": "Lun", "二": "Mar", "三": "Mer", "四": "Jeu", "五": "Ven", "六": "Sam",
    "神秘之卵": "Œuf mystère", "翩翩彩蝶": "Papillon", "山林猛虎": "Tigre des montagnes", "騰雲神龍": "Dragon des nuages",
    "語言 Language": "Langue", "自由路線": "Parcours libre",
  },
  de: {
    "探索": "Entdecken", "記錄": "Aufzeichnen", "夥伴": "Begleiter", "社群": "Community", "我的": "Profil",
    "儲存": "Speichern", "取消": "Abbrechen", "關閉": "Schließen", "確定": "OK", "刪除": "Löschen",
    "編輯": "Bearbeiten", "略過": "Überspringen", "下一步": "Weiter", "重試": "Erneut", "清除": "Löschen",
    "篩選": "Filtern", "列表": "Liste", "地圖": "Karte", "附近": "In der Nähe", "難度": "Schwierigkeit",
    "地區": "Region", "主題": "Thema", "排序": "Sortieren", "名稱": "Name", "搜尋": "Suchen",
    "收藏": "Favoriten", "全部": "Alle", "步道": "Weg", "長度": "Länge", "預估時間": "Geschätzte Zeit",
    "輕鬆": "Leicht", "一般": "Mittel", "進階": "Fortgeschritten", "挑戰": "Schwer", "困難": "Sehr schwer", "雪季": "Schneesaison",
    "追蹤": "Folgen", "已追蹤": "Folgt", "粉絲": "Follower", "追蹤中": "Folgt", "貼文": "Beitrag",
    "留言": "Kommentar", "讚": "Gefällt mir", "分享": "Teilen", "通知": "Benachrichtigungen", "揪團": "Touren",
    "發布": "Posten", "重新整理": "Aktualisieren", "剛剛": "Gerade eben", "今天": "Heute", "回覆": "Antworten",
    "步數": "Schritte", "大卡": "kcal", "距離": "Distanz", "時間": "Zeit", "爬升": "Aufstieg", "下降": "Abstieg",
    "海拔": "Höhe", "天氣": "Wetter", "美食": "Essen", "景點": "Sehenswürdigkeiten", "相片": "Fotos", "足跡": "Spuren",
    "每日任務": "Tagesmissionen", "成就勳章": "Erfolge", "活力": "Energie", "親密度": "Bindung", "準備": "Bereit",
    "小隊": "Team", "隊友": "Teammitglieder", "隊長": "Teamleiter", "翻譯年糕": "Übersetzen", "免費": "Kostenlos",
    "無限": "Unbegrenzt", "升級 Premium": "Premium holen", "離線地圖": "Offline-Karten", "雲端備份": "Cloud-Backup",
    "晴": "Sonnig", "多雲": "Bewölkt", "陰": "Bedeckt", "小雨": "Leichter Regen", "中雨": "Regen", "大雨": "Starkregen",
    "陣雨": "Schauer", "雷雨": "Gewitter", "霧": "Nebel", "晴時多雲": "Heiter bis wolkig",
    "日": "So", "一": "Mo", "二": "Di", "三": "Mi", "四": "Do", "五": "Fr", "六": "Sa",
    "神秘之卵": "Mysteriöses Ei", "翩翩彩蝶": "Schmetterling", "山林猛虎": "Bergtiger", "騰雲神龍": "Wolkendrache",
    "語言 Language": "Sprache", "自由路線": "Freie Route",
  },
  cn: {
    // 簡中：T2S 已好，只修大陸用語差異
    "貼文": "帖子", "留言": "评论", "影片": "视频", "相片": "照片", "揪團": "组队", "夥伴": "伙伴",
    "步數": "步数", "親密度": "亲密度", "離線地圖": "离线地图", "雲端備份": "云备份", "隨手拍": "随手拍",
    "翻譯年糕": "翻译", "資訊": "信息", "設定": "设置", "品質": "质量", "預設": "默认",
  },
};

const LOCALE = { ko: "ko-KR", fr: "fr-FR", de: "de-DE", cn: "zh-CN" };
const TRTGT = { ko: "ko", fr: "fr", de: "de", cn: "zh-CN" };

for (const code of ["ko", "fr", "de", "cn"]) {
  const raw = JSON.parse(fs.readFileSync(`scratchpad/${code}-dict-raw.json`, "utf8"));
  const merged = Object.assign({}, raw, FIX[code]);
  fs.writeFileSync(`scratchpad/${code}-dict.json`, JSON.stringify(merged, null, 1));
  console.log(code, "final", Object.keys(merged).length, "fixes", Object.keys(FIX[code]).length);
}
fs.writeFileSync("scratchpad/lang-meta.json", JSON.stringify({ LOCALE, TRTGT }, null, 1));
