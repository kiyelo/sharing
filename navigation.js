// 모든 페이지에 공통으로 들어갈 메뉴판 컴포넌트
const menuHTML = `
    <nav>
        <a href="index.html">홈</a> | 
        <a href="about.html">소개</a> | 
        <a href="portfolio.html">포트폴리오</a> |
        <a href="new-page.html">새로 만든 페이지</a> </nav>
`;

// HTML 내부에서 id가 "menu"인 곳에 위 코드를 꽂아넣음
document.getElementById('menu').innerHTML = menuHTML;