export const members=[
{id:'me',name:'영롱',emoji:'🌿',role:'owner'},{id:'su',name:'수호',emoji:'🐶'},{id:'da',name:'다온',emoji:'🍊'},{id:'jh',name:'지호',emoji:'🪁'},{id:'ha',name:'하은',emoji:'🌸'},{id:'jw',name:'준서',emoji:'🌊'},{id:'sy',name:'서연',emoji:'☀️'},{id:'mj',name:'민준',emoji:'🌳'},{id:'yu',name:'유나',emoji:'🧡'},{id:'dy',name:'도윤',emoji:'🚲'}]
const titles=['프로젝트 킥오프 안건 정리','디자인 시스템 컬러 토큰 검토','이번 주 회고 메모 작성','장보기 — 우유, 달걀, 커피, 휴지, 세제, 고양이 모래까지 잊지 말고 한 번에 사오기','30분 운동하기','부모님께 안부 전화','여행 숙소 후보 비교하고 가격·위치·후기까지 표로 정리해서 공유하기','읽을 아티클 모아두기','세금 서류 제출','자전거 라이트 교체','도서관 책 반납','블로그 초안 퇴고','화분 물주기','주간 회의 안건 공유']
const homeTitles=['주말 장보기 리스트 확정','세탁소에 코트 맡기기','공과금 이체','거실 전구 교체','분리수거 버리기','에어컨 필터 청소','약국에서 영양제 사오기','주말 데이트 식당 예약','화장실 수건 교체','베란다 화분 분갈이','차량 정기점검 예약','부모님 생신 선물 고르기']
const tripTitles=['숙소 최종 결제','KTX 왕복 예매','렌터카 비교해서 예약','짐 체크리스트 만들기','첫날 저녁 횟집 예약']
const now=Date.now()
const homeAssignees=[['me'],['su'],['da'],['jh'],['ha'],['jw'],['sy'],['mj','yu'],['yu'],['dy'],['su'],['me']]
const homeTasks=homeTitles.map((title,i)=>({id:`c1t${i}`,title,assignees:homeAssignees[i],assignee:homeAssignees[i][0],done:i===homeTitles.length-1,doneAt:i,completedAt:i===homeTitles.length-1?new Date(now-7200000).toISOString():null,sourceUnread:i===1||i===4||i===homeTitles.length-1}))
export const starterData={
personal:titles.map((title,i)=>({id:`p${i}`,title,done:false,createdAt:now-i*1000})),
circles:[
{id:'c1',name:'우리집',emoji:'🏠',code:'KKIU-VOMZ',unread:0,unreadDone:1,members,memberUnread:{me:2,su:1},tasks:homeTasks},
{id:'c2',name:'강릉 여행',emoji:'✈️',code:'KKIU-TRIP',unread:3,unreadDone:0,members:members.slice(0,3),memberUnread:{},tasks:tripTitles.map((title,i)=>({id:`c2t${i}`,title,assignee:['me','da','su','da','me'][i],done:false}))}
],settings:{compact:false,motion:true,notifications:true,language:'ko'}}
