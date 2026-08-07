# İkili Oda

GitHub Pages üzerinde çalışacak, oda kodlu iki kişilik sohbet. Derleme veya npm kurulumu gerekmez.

## Firebase kurulumu

1. [Firebase Console](https://console.firebase.google.com/) üzerinden yeni bir proje oluştur.
2. Proje ayarları → **Your apps** → Web simgesi ile bir web uygulaması ekle.
3. **Authentication → Sign-in method** bölümünde **Anonymous** giriş yöntemini aç.
4. **Firestore Database → Create database** ile veritabanını oluştur. Başlangıçta production mode seçebilirsin.
5. Bu klasördeki `firestore.rules` içeriğini Firebase Console → Firestore Database → **Rules** alanına yapıştır ve **Publish** de.
6. Firebase web uygulamasının config nesnesini kopyala ve [firebase-config.js](/Users/erdinc/Desktop/claude2/firebase-config.js) içindeki `PASTE_...` alanlarını değiştir.

Firebase web config içindeki `apiKey` istemci uygulamalarında görünür; bunu gizli parola gibi saklaman gerekmez. Firestore verisini koruyan kısım, burada verilen güvenlik kurallarıdır. Yine de Firebase projesinde GitHub Pages adresini **Authentication → Settings → Authorized domains** bölümüne ekle.

## GitHub Pages

Bu klasörü GitHub reposuna gönder. GitHub’da **Settings → Pages** bölümünde:

- Source: **Deploy from a branch**
- Branch: `main`
- Folder: `/ (root)`

Sonra açılan Pages adresini Firebase Authentication içindeki **Authorized domains** listesine ekle.

## Silme davranışı

`Sohbeti sil` tıklandığında:

1. Oda `deleting` durumuna alınır ve yeni mesaj yazımı kapanır.
2. `rooms/{oda}/messages` altındaki tüm mesaj belgeleri 450'lik Firestore batch'leri ile silinir.
3. En son `rooms/{oda}` oda belgesi silinir.

Bu, aktif Firestore verisini siler ve alt koleksiyonun geride kalmasını engeller. Firebase/Google'ın yedekleme, güvenlik ve erişim logları gibi servis içi kayıtları için hiçbir web uygulaması “mutlak olarak hiçbir iz kalmaz” garantisi veremez. Mesajların kendisi uygulamanın aktif veritabanından kaldırılır.
