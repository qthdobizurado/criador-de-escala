# Guia Completo — Gerador de Escala com Firebase

## Visão Geral

Este guia explica como configurar e publicar o **Gerador de Escala** na internet usando o Firebase (Google), de graça. Ao final você terá um site acessível por qualquer pessoa via link, com login pelo Google e salvamento na nuvem.

---

## PARTE 1 — Criar a conta e o projeto no Firebase

### 1.1 Acessar o Firebase Console

1. Acesse **https://console.firebase.google.com**
2. Faça login com sua conta Google
3. Clique em **"Criar um projeto"**
4. Digite o nome do projeto (ex: `gerenciador-escala`)
5. Desative o Google Analytics se quiser (opcional) e clique em **"Criar projeto"**

---

## PARTE 2 — Configurar o Authentication (Login com Google)

### 2.1 Ativar o provedor Google

1. No menu lateral esquerdo, clique em **"Segurança"** para expandir
2. Clique em **"Authentication"**
3. Clique em **"Primeiros passos"**
4. Clique em **"Google"** na lista de provedores
5. Ative o toggle no canto superior direito
6. Preencha um **e-mail de suporte** (pode ser o seu)
7. Clique em **"Salvar"**

---

## PARTE 3 — Criar o banco de dados Firestore

### 3.1 Criar o banco

1. No menu lateral, clique em **"Bancos de dados e armazenamento"** para expandir
2. Clique em **"Firestore Database"**
3. Clique em **"Criar banco de dados"**
4. Na tela de edição, selecione **"Standard"** (gratuito)
5. Clique em **"Continuar"**
6. Em "Local do banco de dados", escolha **`southamerica-east1 (São Paulo)`**
7. Clique em **"Criar"**

### 3.2 Configurar as Regras de Segurança

1. Dentro do Firestore, clique na aba **"Regras"**
2. Apague todo o conteúdo que já está lá
3. Cole as regras abaixo:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /slots/{slotId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

4. Clique em **"Publicar"**

> Estas regras garantem que cada usuário acessa **somente os próprios dados**.

---

## PARTE 4 — Registrar o App Web e obter as chaves

### 4.1 Adicionar o app Web

1. Na tela inicial do projeto, clique em **"+ Adicionar app"**
2. Clique no ícone **`</>`** (Web)
3. Em "Apelido do app", digite qualquer nome (ex: `escala-web`)
4. Marque **"Configure também o Firebase Hosting para este app"**
5. Clique em **"Registrar app"**

### 4.2 Copiar as chaves do projeto

1. Na tela seguinte, clique na aba **"Config"**
2. Você verá um objeto `firebaseConfig` com suas chaves
3. Copie os valores — você vai precisar deles no arquivo `firebase-auth.js`

> Não compartilhe essas chaves publicamente. Para este projeto elas ficam no código do site, o que é aceitável porque as Regras do Firestore protegem os dados.

4. Clique em **"Continuar no console"** (ou feche a tela)

---

## PARTE 5 — Configurar os arquivos do projeto

Você terá 4 arquivos para colocar no seu computador:

| Arquivo | Função |
|---|---|
| `index.html` | Estrutura da página (tela de login e app) |
| `styles.css` | Visual e estilos |
| `script.js` | Toda a lógica do app |
| `firebase-auth.js` | Conexão com o Firebase |

### 5.1 Preencher as chaves no firebase-auth.js

Abra o arquivo `firebase-auth.js` e localize o bloco no topo:

```js
const FIREBASE_CONFIG = {
  apiKey:            "...",
  authDomain:        "...",
  projectId:         "...",
  storageBucket:     "...",
  messagingSenderId: "...",
  appId:             "...",
  measurementId:     "..."
};
```

Substitua cada valor pelo que você copiou no passo 4.2.

---

## PARTE 6 — Instalar as ferramentas e fazer o deploy

### 6.1 Instalar o Node.js

1. Acesse **https://nodejs.org**
2. Baixe e instale a versão **LTS** (botão verde)
3. Para verificar, abra o **Prompt de Comando** (Win+R → `cmd` → Enter) e digite:

```
node -v
```

Deve aparecer algo como `v24.x.x`.

### 6.2 Instalar o Firebase CLI

No Prompt de Comando, rode:

```
npm install -g firebase-tools
```

Aguarde a instalação terminar (pode demorar 1-2 minutos).

### 6.3 Fazer login no Firebase pelo terminal

```
firebase login
```

- O navegador vai abrir pedindo para entrar com sua conta Google
- Entre com a mesma conta que você usou no Firebase Console
- Quando aparecer **"Success! Logged in as..."** no terminal, está pronto

### 6.4 Criar a pasta do projeto

```
mkdir C:\Users\SeuNome\escala
cd C:\Users\SeuNome\escala
```

> Substitua `SeuNome` pelo seu nome de usuário do Windows.

### 6.5 Inicializar o Firebase Hosting na pasta

```
firebase init hosting
```

Responda as perguntas assim:

| Pergunta | Resposta |
|---|---|
| Install agent skills for Firebase? | **N** |
| Which project? | Selecione **gerenciador-escala** com as setas e Enter |
| What do you want to use as your public directory? | Digite **`.`** (ponto) e Enter |
| Configure as a single-page app? | **N** |
| Set up automatic builds with GitHub? | **N** |
| File ./index.html already exists. Overwrite? | **N** |

Quando aparecer **"Firebase initialization complete!"**, a pasta está pronta.

### 6.6 Copiar os arquivos para a pasta

Abra o **Explorador de Arquivos** do Windows, navegue até `C:\Users\SeuNome\escala` e copie os 4 arquivos para lá:

- `index.html`
- `styles.css`
- `script.js`
- `firebase-auth.js`

### 6.7 Publicar o site

De volta ao terminal (certifique-se de estar na pasta `escala`):

```
firebase deploy --only hosting
```

Aguarde alguns segundos. Quando aparecer **"Deploy complete!"**, o site está no ar!

Você verá a URL do site na linha:

```
Hosting URL: https://gerenciador-escala.web.app
```

---

## PARTE 7 — Atualizar o site no futuro

Sempre que precisar atualizar algum arquivo (corrigir um bug, melhorar o visual, etc.):

1. Substitua o(s) arquivo(s) na pasta `C:\Users\SeuNome\escala`
2. Abra o Prompt de Comando, entre na pasta e rode:

```
cd C:\Users\SeuNome\escala
firebase deploy --only hosting
```

Pronto — o site é atualizado em segundos.

---

## Resumo Final

| O que foi configurado | Onde |
|---|---|
| Login com Google | Firebase Authentication |
| Banco de dados dos saves | Firebase Firestore |
| Regras de segurança | Firestore > Regras |
| Hospedagem do site | Firebase Hosting |
| URL do site | https://gerenciador-escala.web.app |

---

## Plano Gratuito (Spark) — Limites

O projeto usa o plano gratuito do Firebase, que suporta bem múltiplos usuários simultâneos:

| Recurso | Limite gratuito |
|---|---|
| Leituras do Firestore | 50.000 por dia |
| Escritas do Firestore | 20.000 por dia |
| Armazenamento | 1 GB |
| Hospedagem (tráfego) | 10 GB por mês |
| Usuários autenticados | Ilimitado |

Para o uso esperado do Gerador de Escala, esses limites são mais do que suficientes.
