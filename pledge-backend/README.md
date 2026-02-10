# pledge-backend
启动mysql 服务
docker run -d --name pledge-mysql \
  -e MYSQL_ROOT_PASSWORD=root123 \
  -e MYSQL_DATABASE=pledge_v21 \
  -e MYSQL_USER=pledge_v21 \
  -e MYSQL_PASSWORD=pledge_v21 \
  -p 3307:3306 \
  mysql:latest

# 清理旧的pledge-redis容器
docker stop pledge-redis 2>/dev/null || true
docker rm pledge-redis 2>/dev/null || true

# 重新启动Redis在6380端口
docker run -d --name pledge-redis \
  -p 6380:6379 \
  redis:7-alpine \
  redis-server --requirepass "pledger_web3"

# 修改配置文件使用6380端口
sed -i 's/port = "6379"/port = "6380"/g' config/configV21.toml

# 运行Go应用
cd api
go run pledge_api.go


使用docker 一键配置好mysql 和radius
# 清理手动创建的容器
docker stop pledge-mysql pledge-redis 2>/dev/null || true
docker rm pledge-mysql pledge-redis 2>/dev/null || true

# 在pledge-backend目录使用docker compose
cd /home/Project_advanced_pledge/pledge-backend
docker compose up -d

docker stop $(docker ps -q)

The project is divided into two parts, one is API and the other is scheduled task

API

    cd api
    go run pledge_api.go

pool task
    export $(cat .env | xargs) 加载配置文件


    cd schedule
    go run pledge_task.go 