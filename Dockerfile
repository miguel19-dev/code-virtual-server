# Imagen base oficial de Ubuntu
FROM ubuntu:22.04

# Evitar prompts interactivos
ENV DEBIAN_FRONTEND=noninteractive

# Variables de entorno para Android SDK
ENV ANDROID_HOME=/usr/local/android-sdk
ENV PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

# Instalar dependencias básicas
RUN apt-get update && apt-get install -y \
    curl wget tar nodejs npm git unzip openjdk-11-jdk gradle \
    && rm -rf /var/lib/apt/lists/*

# Descargar e instalar code-server
RUN wget https://github.com/coder/code-server/releases/download/v4.16.1/code-server-4.16.1-linux-amd64.tar.gz \
    && tar -xvf code-server-4.16.1-linux-amd64.tar.gz \
    && mv code-server-4.16.1-linux-amd64 /usr/local/code-server \
    && rm code-server-4.16.1-linux-amd64.tar.gz

# Instalar Android SDK (command-line tools)
RUN mkdir -p $ANDROID_HOME/cmdline-tools \
    && cd $ANDROID_HOME/cmdline-tools \
    && wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
    && unzip commandlinetools-linux-11076708_latest.zip \
    && rm commandlinetools-linux-11076708_latest.zip \
    && mv cmdline-tools latest

# Aceptar licencias e instalar plataformas básicas
RUN yes | sdkmanager --licenses \
    && sdkmanager "platform-tools" "platforms;android-33" "build-tools;33.0.2"

# Crear usuario no root
RUN useradd -m coder
USER coder
WORKDIR /home/coder

# Configuración de code-server
ENV PASSWORD=mO*061119
EXPOSE 8080

CMD ["/usr/local/code-server/bin/code-server", "--bind-addr", "0.0.0.0:8080", "--auth", "password"]