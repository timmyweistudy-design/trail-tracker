import fs from "fs";
const FIX = {
  pt: { "探索": "Explorar", "記錄": "Registrar", "夥伴": "Companheiro", "社群": "Comunidade", "我的": "Perfil",
    "貼文": "Publicação", "留言": "Comentário", "讚": "Curtir", "追蹤": "Seguir", "粉絲": "Seguidores",
    "步道": "Trilha", "難度": "Dificuldade", "輕鬆": "Fácil", "一般": "Moderado", "進階": "Avançado", "挑戰": "Difícil", "困難": "Árduo",
    "離線地圖": "Mapas offline", "翻譯年糕": "Traduzir", "小隊": "Equipe", "準備": "Pronto", "免費": "Grátis", "無限": "Ilimitado",
    "日": "Dom", "一": "Seg", "二": "Ter", "三": "Qua", "四": "Qui", "五": "Sex", "六": "Sáb", "自由路線": "Rota livre",
    "晴": "Ensolarado", "多雲": "Nublado", "陰": "Encoberto", "小雨": "Chuva fraca", "陣雨": "Aguaceiros", "雷雨": "Trovoadas", "霧": "Névoa" },
  it: { "探索": "Esplora", "記錄": "Registra", "夥伴": "Compagno", "社群": "Comunità", "我的": "Profilo",
    "貼文": "Post", "留言": "Commento", "讚": "Mi piace", "追蹤": "Segui", "粉絲": "Follower",
    "步道": "Sentiero", "難度": "Difficoltà", "輕鬆": "Facile", "一般": "Moderato", "進階": "Avanzato", "挑戰": "Difficile", "困難": "Arduo",
    "離線地圖": "Mappe offline", "翻譯年糕": "Traduci", "小隊": "Squadra", "準備": "Pronto", "免費": "Gratis", "無限": "Illimitato",
    "日": "Dom", "一": "Lun", "二": "Mar", "三": "Mer", "四": "Gio", "五": "Ven", "六": "Sab", "自由路線": "Percorso libero",
    "晴": "Sereno", "多雲": "Nuvoloso", "陰": "Coperto", "小雨": "Pioggia leggera", "陣雨": "Rovesci", "雷雨": "Temporali", "霧": "Nebbia" },
  ru: { "探索": "Обзор", "記錄": "Запись", "夥伴": "Питомец", "社群": "Сообщество", "我的": "Профиль",
    "儲存": "Сохранить", "貼文": "Пост", "留言": "Комментарий", "讚": "Нравится", "追蹤": "Подписаться", "粉絲": "Подписчики",
    "步道": "Тропа", "難度": "Сложность", "輕鬆": "Лёгкий", "一般": "Средний", "進階": "Продвинутый", "挑戰": "Сложный", "困難": "Трудный",
    "離線地圖": "Офлайн-карты", "翻譯年糕": "Перевести", "小隊": "Команда", "準備": "Готов", "免費": "Бесплатно", "無限": "Безлимит",
    "日": "Вс", "一": "Пн", "二": "Вт", "三": "Ср", "四": "Чт", "五": "Пт", "六": "Сб", "自由路線": "Свободный маршрут",
    "晴": "Ясно", "多雲": "Облачно", "陰": "Пасмурно", "小雨": "Небольшой дождь", "陣雨": "Ливни", "雷雨": "Гроза", "霧": "Туман" },
  th: { "探索": "สำรวจ", "記錄": "บันทึกเส้นทาง", "夥伴": "เพื่อนซี้", "社群": "ชุมชน", "我的": "โปรไฟล์",
    "貼文": "โพสต์", "留言": "ความคิดเห็น", "讚": "ถูกใจ", "追蹤": "ติดตาม", "粉絲": "ผู้ติดตาม",
    "步道": "เส้นทาง", "難度": "ความยาก", "輕鬆": "ง่าย", "一般": "ปานกลาง", "進階": "ขั้นสูง", "挑戰": "ยาก", "困難": "ยากมาก",
    "離線地圖": "แผนที่ออฟไลน์", "翻譯年糕": "แปล", "小隊": "ทีม", "準備": "พร้อม", "免費": "ฟรี", "無限": "ไม่จำกัด",
    "日": "อา", "一": "จ", "二": "อ", "三": "พ", "四": "พฤ", "五": "ศ", "六": "ส", "自由路線": "เส้นทางอิสระ",
    "晴": "แดดใส", "多雲": "เมฆมาก", "陰": "ครึ้ม", "小雨": "ฝนปรอย", "陣雨": "ฝนซู่", "雷雨": "พายุฝนฟ้าคะนอง", "霧": "หมอก" },
  vi: { "探索": "Khám phá", "記錄": "Ghi lại", "夥伴": "Bạn đồng hành", "社群": "Cộng đồng", "我的": "Hồ sơ",
    "儲存": "Lưu", "貼文": "Bài viết", "留言": "Bình luận", "讚": "Thích", "追蹤": "Theo dõi", "粉絲": "Người theo dõi",
    "步道": "Đường mòn", "難度": "Độ khó", "輕鬆": "Dễ", "一般": "Trung bình", "進階": "Nâng cao", "挑戰": "Khó", "困難": "Rất khó",
    "離線地圖": "Bản đồ ngoại tuyến", "翻譯年糕": "Dịch", "小隊": "Nhóm", "準備": "Sẵn sàng", "免費": "Miễn phí", "無限": "Không giới hạn",
    "日": "CN", "一": "T2", "二": "T3", "三": "T4", "四": "T5", "五": "T6", "六": "T7", "自由路線": "Lộ trình tự do",
    "晴": "Nắng", "多雲": "Nhiều mây", "陰": "Âm u", "小雨": "Mưa nhỏ", "陣雨": "Mưa rào", "雷雨": "Giông bão", "霧": "Sương mù" },
  id: { "探索": "Jelajahi", "記錄": "Rekam", "夥伴": "Pendamping", "社群": "Komunitas", "我的": "Profil",
    "貼文": "Postingan", "留言": "Komentar", "讚": "Suka", "追蹤": "Ikuti", "粉絲": "Pengikut",
    "步道": "Jalur", "難度": "Kesulitan", "輕鬆": "Mudah", "一般": "Sedang", "進階": "Lanjutan", "挑戰": "Sulit", "困難": "Berat",
    "離線地圖": "Peta offline", "翻譯年糕": "Terjemahkan", "小隊": "Tim", "準備": "Siap", "免費": "Gratis", "無限": "Tanpa batas",
    "日": "Min", "一": "Sen", "二": "Sel", "三": "Rab", "四": "Kam", "五": "Jum", "六": "Sab", "自由路線": "Rute bebas",
    "晴": "Cerah", "多雲": "Berawan", "陰": "Mendung", "小雨": "Hujan ringan", "陣雨": "Hujan lokal", "雷雨": "Badai petir", "霧": "Kabut" },
};
for (const code of Object.keys(FIX)) {
  const raw = JSON.parse(fs.readFileSync(`scratchpad/${code}-dict-raw.json`, "utf8"));
  const merged = Object.assign({}, raw, FIX[code]);
  fs.writeFileSync(`scratchpad/${code}-dict.json`, JSON.stringify(merged, null, 1));
  console.log(code, "final", Object.keys(merged).length, "fixes", Object.keys(FIX[code]).length);
}
