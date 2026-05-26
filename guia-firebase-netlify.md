# Guia — Firebase com Netlify
## Configurar Authentication (Google) + Firestore para site hospedado no Netlify

---

## O que você vai configurar

| Serviço | Função |
|---|---|
| **Firebase Authentication** | Login com Google |
| **Firebase Firestore** | Banco de dados dos saves |
| **Netlify** | Hospedagem do site |

O Firebase cuida do login e dos dados. O Netlify cuida do site.

---

## PARTE 1 — Criar a conta e o projeto

### 1.1 Acessar o Firebase

1. Acesse **https://console.firebase.google.com**
2. Faça login com sua conta Google
3. Clique em **"Criar um projeto"**
4. Digite o nome do projeto (ex: `gerenciador-escala`)
5. Pode desativar o Google Analytics (opcional)
6. Clique em **"Criar projeto"**

---

## PARTE 2 — Ativar o login com Google

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
4. Selecione a edição **"Standard"** (gratuita)
5. Clique em **"Continuar"**
6. Em local, escolha **`southamerica-east1 (São Paulo)`**
7. Clique em **"Criar"**

### 3.2 Configurar as Regras de Segurança

1. Dentro do Firestore, clique na aba **"Regras"**
2. Apague todo o conteúdo existente
3. Cole exatamente o seguinte:

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

> Estas regras garantem que cada usuário acessa somente os próprios dados.

---

## PARTE 4 — Registrar o App Web e obter as chaves

### 4.1 Adicionar o app Web

1. Na tela inicial do projeto, clique em **"+ Adicionar app"**
2. Clique no ícone **`</>`** (Web)
3. Digite qualquer nome (ex: `escala-web`)
4. **NÃO marque** "Configure também o Firebase Hosting" — o site vai ficar no Netlify
5. Clique em **"Registrar app"**

### 4.2 Copiar as chaves

1. Na tela seguinte, clique na aba **"Config"**
2. Você verá um objeto assim:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "000000",
  appId: "1:000000:web:000000"
};
```

3. Copie esses valores — você vai usá-los no arquivo `firebase-auth.js`
4. Clique em **"Continuar no console"**

### 4.3 Colar as chaves no firebase-auth.js

Abra o arquivo `firebase-auth.js` e substitua o bloco `FIREBASE_CONFIG` com os seus valores:

```js
const FIREBASE_CONFIG = {
  apiKey:            "sua-api-key",
  authDomain:        "seu-projeto.firebaseapp.com",
  projectId:         "seu-projeto",
  storageBucket:     "seu-projeto.appspot.com",
  messagingSenderId: "seu-id",
  appId:             "seu-app-id"
};
```

---

## PARTE 5 — Subir o site no Netlify

### 5.1 Criar conta no GitHub (se não tiver)

1. Acesse **https://github.com**
2. Clique em **"Sign up"** e crie uma conta gratuita

### 5.2 Criar o repositório

1. Clique em **"New repository"**
2. Dê um nome (ex: `gerador-escala`)
3. Pode deixar **privado**
4. Clique em **"Create repository"**
5. Suba os 4 arquivos do projeto:
   - `index.html`
   - `styles.css`
   - `script.js`
   - `firebase-auth.js`

### 5.3 Conectar o Netlify ao GitHub

1. Acesse **https://netlify.com**
2. Crie uma conta gratuita (pode entrar com o GitHub)
3. Clique em **"Add new site" > "Import from Git"**
4. Escolha **GitHub** e autorize o acesso
5. Selecione o repositório que você criou
6. Deixe as configurações de build em branco
7. Clique em **"Deploy site"**

Após alguns segundos o site estará no ar com uma URL tipo:
`https://nome-aleatorio.netlify.app`

Você pode personalizar essa URL em **Site configuration > Change site name**.

---

## PARTE 6 — Autorizar o domínio do Netlify no Firebase

Este passo é obrigatório — sem ele o login com Google vai ser bloqueado.

1. Acesse:
**https://console.firebase.google.com/project/SEU-PROJETO/authentication/settings**
(substitua `SEU-PROJETO` pelo ID do seu projeto)

2. Clique na aba **"Domínios autorizados"**
3. Clique em **"Adicionar domínio"**
4. Cole a URL do seu site no Netlify (ex: `nome-aleatorio.netlify.app`)
5. Clique em **"Adicionar"**

> Se você personalizar o nome do site no Netlify, repita este passo com o novo domínio.

---

## PARTE 7 — Atualizar o site no futuro

Como o Netlify está conectado ao GitHub, a atualização é automática:

1. Substitua o(s) arquivo(s) no seu repositório GitHub
2. O Netlify detecta a mudança e publica automaticamente em 1-2 minutos

Não precisa de terminal nem de nenhum comando.

---

## Resumo Final

| O que foi configurado | Onde |
|---|---|
| Login com Google | Firebase Authentication |
| Banco de dados dos saves | Firebase Firestore |
| Regras de segurança | Firestore > Regras |
| Chaves do projeto | firebase-auth.js |
| Hospedagem do site | Netlify |
| Domínio autorizado | Firebase Authentication > Configurações |

---

## Plano Gratuito — Limites

### Firebase (Plano Spark)
| Recurso | Limite gratuito |
|---|---|
| Usuários autenticados | Ilimitado |
| Leituras do Firestore | 50.000 por dia |
| Escritas do Firestore | 20.000 por dia |
| Armazenamento | 1 GB |

### Netlify (Plano Free)
| Recurso | Limite gratuito |
|---|---|
| Sites hospedados | Ilimitado |
| Tráfego | 100 GB por mês |
| Deploys | 300 minutos por mês |

Para o uso esperado do Gerador de Escala, ambos os planos gratuitos são mais que suficientes.
