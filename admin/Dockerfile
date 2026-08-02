# DİKKAT: Coolify bu Dockerfile'ı KULLANMIYOR. qorai-admin uygulamasının
# build pack'i `static` (nginx:alpine, publish_directory=/), dockerfile değil.
# Yalnız yerel/alternatif kurulumlar için duruyor. Canlı nginx ayarının nerede
# yaşadığı ve nasıl güncellendiği: admin/nginx.conf başındaki blok.
FROM nginx:alpine
COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
