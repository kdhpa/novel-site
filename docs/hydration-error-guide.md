# React Hydration 에러 이해하기

이 문서는 Next.js/React에서 자주 발생하는 Hydration 에러에 대해 설명합니다.

---

## 1. SSR(Server-Side Rendering)이란?

### 기존 방식 (CSR - Client-Side Rendering)
```
1. 브라우저가 서버에 페이지 요청
2. 서버가 빈 HTML + JavaScript 파일 전송
3. 브라우저가 JavaScript 실행
4. JavaScript가 화면을 그림 (이때까지 빈 화면)
```

### Next.js 방식 (SSR - Server-Side Rendering)
```
1. 브라우저가 서버에 페이지 요청
2. 서버가 React 컴포넌트를 실행해서 완성된 HTML을 만듦
3. 완성된 HTML + JavaScript 파일 전송
4. 브라우저가 HTML을 바로 표시 (빠른 첫 화면!)
5. JavaScript가 로드되면 "Hydration" 실행
```

**장점**: 사용자가 페이지를 더 빨리 볼 수 있고, 검색엔진(SEO)도 내용을 읽을 수 있음

---

## 2. Hydration이란?

"Hydration"은 "수분 공급"이라는 뜻인데, React에서는 **"정적인 HTML에 JavaScript 기능을 연결하는 과정"**을 의미합니다.

### 비유로 이해하기
```
서버가 보낸 HTML = 마네킹 (모양만 있고 움직이지 않음)
Hydration = 마네킹에 생명을 불어넣어 실제 사람처럼 만드는 것

구체적으로:
- 버튼 클릭 이벤트 연결
- 상태(state) 관리 시작
- 동적 기능 활성화
```

### Hydration 과정
```
1. 서버에서 받은 HTML이 화면에 표시됨
2. React JavaScript가 로드됨
3. React가 "이 HTML이 내가 만들 것과 같은지?" 확인
4. 같으면 → 이벤트 핸들러만 연결 (빠름!)
5. 다르면 → Hydration 에러 발생!
```

---

## 3. Hydration 에러가 발생하는 이유

서버에서 만든 HTML과 브라우저에서 React가 만들려는 HTML이 **다를 때** 발생합니다.

### 흔한 원인들

#### 원인 1: 브라우저 전용 코드
```tsx
// 잘못된 예
function Component() {
  // window는 브라우저에만 존재, 서버에는 없음!
  const width = window.innerWidth;
  return <div>화면 너비: {width}</div>;
}

// 올바른 예
function Component() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // useEffect는 브라우저에서만 실행됨
    setWidth(window.innerWidth);
  }, []);

  return <div>화면 너비: {width}</div>;
}
```

#### 원인 2: 시간/날짜 사용
```tsx
// 잘못된 예
function Component() {
  // 서버 시간과 브라우저 시간이 다를 수 있음!
  return <div>현재 시간: {new Date().toLocaleString()}</div>;
}

// 올바른 예
function Component() {
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    setTime(new Date().toLocaleString());
  }, []);

  return <div>현재 시간: {time || '로딩 중...'}</div>;
}
```

#### 원인 3: 랜덤 값 사용
```tsx
// 잘못된 예
function Component() {
  // 서버와 브라우저에서 다른 값이 나옴!
  const id = Math.random();
  return <div id={`item-${id}`}>내용</div>;
}

// 올바른 예
function Component() {
  const [id, setId] = useState<number | null>(null);

  useEffect(() => {
    setId(Math.random());
  }, []);

  return <div id={id ? `item-${id}` : undefined}>내용</div>;
}
```

#### 원인 4: 잘못된 HTML 중첩 (이번 에러의 원인!)
```tsx
// 잘못된 예 - <a> 안에 <button>은 HTML 표준 위반!
<Link href="/page">        {/* <a> 태그로 렌더링됨 */}
  <Button>클릭</Button>    {/* <button> 태그로 렌더링됨 */}
</Link>

// 브라우저가 잘못된 HTML을 "수정"하면서 구조가 달라짐
// → 서버 HTML과 브라우저 DOM이 불일치 → Hydration 에러!
```

---

## 4. HTML 중첩 규칙 (이번 에러의 핵심)

HTML에는 **어떤 태그 안에 어떤 태그가 들어갈 수 있는지 규칙**이 있습니다.

### Interactive Content (상호작용 요소)
다음 요소들은 서로 중첩될 수 없습니다:
- `<a>` (링크)
- `<button>` (버튼)
- `<input>` (입력)
- `<select>` (선택)
- `<textarea>` (텍스트 영역)

```html
<!-- 모두 잘못된 HTML! -->
<a href="/"><button>클릭</button></a>
<button><a href="/">링크</a></button>
<a href="/"><a href="/other">중첩 링크</a></a>
```

### 브라우저의 "자동 수정"
브라우저는 잘못된 HTML을 받으면 자동으로 "수정"합니다:

```html
<!-- 서버가 보낸 잘못된 HTML -->
<a href="/">
  <button>클릭</button>
</a>

<!-- 브라우저가 수정한 결과 (예시) -->
<a href="/"></a>
<button>클릭</button>

<!-- 또는 -->
<a href="/"></a><button>클릭</button><a></a>
```

정확히 어떻게 수정되는지는 브라우저마다 다를 수 있습니다.
이 "수정" 때문에 서버 HTML과 브라우저 DOM이 달라지고, Hydration 에러가 발생합니다.

### 다른 중첩 규칙들

#### `<p>` 태그 안에 블록 요소 금지
```html
<!-- 잘못된 예 -->
<p>
  <div>블록 요소</div>
</p>

<!-- 브라우저가 이렇게 수정함 -->
<p></p>
<div>블록 요소</div>
<p></p>
```

#### `<table>` 구조 규칙
```html
<!-- 잘못된 예 -->
<table>
  <div>내용</div>
</table>

<!-- 올바른 예 -->
<table>
  <tbody>
    <tr>
      <td>내용</td>
    </tr>
  </tbody>
</table>
```

---

## 5. 이번 에러 해결 방법

### 문제가 된 코드
```tsx
<Link href="/novels">
  <Button size="lg">작품 둘러보기</Button>
</Link>
```

이 코드는 결과적으로 이런 HTML을 생성합니다:
```html
<a href="/novels">
  <button>작품 둘러보기</button>
</a>
```

### 해결 방법 1: Link에 직접 스타일 적용 (현재 적용된 방법)
```tsx
<Link
  href="/novels"
  className="버튼처럼 보이는 스타일..."
>
  작품 둘러보기
</Link>
```

결과 HTML:
```html
<a href="/novels" class="버튼처럼 보이는 스타일...">
  작품 둘러보기
</a>
```

### 해결 방법 2: Button에 asChild 패턴 추가
shadcn/ui 같은 라이브러리에서 사용하는 방식입니다:

```tsx
// Button 컴포넌트에 asChild prop 추가
<Button asChild>
  <Link href="/novels">작품 둘러보기</Link>
</Button>
```

asChild가 true면 Button이 `<button>` 대신 자식 요소(`<Link>`)를 렌더링합니다.

### 해결 방법 3: useRouter 사용
```tsx
'use client';
import { useRouter } from 'next/navigation';

function Component() {
  const router = useRouter();

  return (
    <Button onClick={() => router.push('/novels')}>
      작품 둘러보기
    </Button>
  );
}
```

---

## 6. Hydration 에러 디버깅 팁

### 에러 메시지 읽는 법
```
Hydration failed because the server rendered HTML didn't match the client.

Expected server HTML to contain a matching <div> in <section>.
  ...
+  <div className="...">    ← 서버가 렌더링한 것
-  <h2 className="...">     ← 클라이언트가 기대한 것
```

- `+` : 서버에서 렌더링된 요소
- `-` : 클라이언트에서 기대한 요소

### 체크리스트
1. `typeof window !== 'undefined'` 분기가 있는가?
2. `Date.now()`, `Math.random()` 등을 사용하는가?
3. `<a>` 안에 `<button>`, `<p>` 안에 `<div>` 등 잘못된 중첩이 있는가?
4. 브라우저 확장 프로그램이 HTML을 수정하는가?
5. 조건부 렌더링이 서버/클라이언트에서 다른 결과를 내는가?

### suppressHydrationWarning
피할 수 없는 경우(예: 시간 표시)에만 사용:
```tsx
<time suppressHydrationWarning>
  {new Date().toLocaleString()}
</time>
```

이 속성은 **해당 요소에만** 적용되고, 자식 요소에는 적용되지 않습니다.

---

## 7. 참고 자료

- [Next.js 공식 문서 - Hydration Error](https://nextjs.org/docs/messages/react-hydration-error)
- [React 공식 문서 - Hydration](https://react.dev/reference/react-dom/client/hydrateRoot)
- [HTML 표준 - Content Models](https://html.spec.whatwg.org/multipage/dom.html#content-models)
- [MDN - Interactive Content](https://developer.mozilla.org/en-US/docs/Web/HTML/Content_categories#interactive_content)
