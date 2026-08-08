# İkili Oda

GitHub Pages üzerinde çalışan, oda kodlu iki kişilik sohbet. Firebase Spark planında çalışır; Cloud Functions veya Blaze planı gerektirmez.

## Firebase kurulumu

1. [Firebase Console](https://console.firebase.google.com/) üzerinden `deneme` projesini aç.
2. Authentication → Sign-in method bölümünde **Anonymous** girişini aç.
3. Firestore Database oluştur.
4. [firestore.rules](/Users/erdinc/Desktop/claude2/firestore.rules) içeriğini Firestore → Rules alanına yapıştır ve **Publish** de.
5. Databases & Storage → Realtime Database → **Create database** seç. Ücretsiz kalmak için Spark planında devam et; başlangıçta **Locked mode** seçebilirsin.
6. Realtime Database ekranının üst kısmında görünen veritabanı adresini [firebase-config.js](/Users/erdinc/Desktop/claude2/firebase-config.js) içindeki `databaseURL` alanına yapıştır.
7. [database.rules.json](/Users/erdinc/Desktop/claude2/database.rules.json) içeriğini Realtime Database → Rules alanına yapıştır ve **Publish** de.
8. [firebase-config.js](/Users/erdinc/Desktop/claude2/firebase-config.js) içindeki diğer config değerlerini Firebase web uygulamasının config bilgileriyle doldur.

## Veri modeli

Spark uyumluluğu için yalnızca `rooms/current` belgesi kullanılır. Oda kodu, katılımcılar ve mesajlar bu belgenin içindedir. Yeni oda oluşturulduğunda mevcut `current` belgesinin üzerine yazılır; böylece aktif sohbet ve mesajlar aynı işlemde temizlenir.

Bu basit modelin Firestore belge boyutu sınırı vardır. Çok uzun sohbetler için mesajları tekrar alt koleksiyona taşımak ve sunucu tarafı silme kullanmak gerekir.

İlk sürümde oluşturulmuş `5EPEAHW2` gibi eski test odalarını Firebase Console → Firestore → `rooms` koleksiyonundaki menüden bir kez sil. Yeni sürüm yalnızca `rooms/current` kullanır.

## GitHub Pages

GitHub’da **Settings → Pages** bölümünde:

- Source: **Deploy from a branch**
- Branch: `main`
- Folder: `/ (root)`

Sonra GitHub Pages adresini Firebase Authentication → Settings → Authorized domains listesine ekle.

## Silme davranışı

`Sohbeti sil` tıklandığında `rooms/current` belgesi silinir; mesajlar da bu belgenin içinde bulunduğu için ayrıca alt koleksiyon temizliği gerekmez. Yeni oda oluşturmak da mevcut aktif belgeyi boş `messages` listesiyle değiştirir.

Firebase Authentication’daki anonim kullanıcı kayıtları bu işlemlerle silinmez; bunlar sohbet mesajı değildir.

## Kullanıcı ayrılınca otomatik silme

Realtime Database yalnızca çevrimiçi bağlantı bilgisini tutar. Firebase’in `onDisconnect` özelliği sayesinde tarayıcı kapanınca veya bağlantı kopunca bağlantı kaydı sunucu tarafından kaldırılır. Kalan kullanıcı yaklaşık birkaç saniye içinde diğer kişinin ayrıldığını görür ve `rooms/current` belgesini siler. Böylece sohbet mesajları da silinir.

Bu özellik Spark planıyla çalışır; Cloud Functions ve Blaze planı gerekmez. İki kullanıcı aynı anda tamamen çevrimdışı olursa kalan istemci bulunmadığı için silme isteğini gönderecek istemci olmayabilir. Normal ayrılma/kapanma durumunda kalan kullanıcı silme işlemini gerçekleştirir.
