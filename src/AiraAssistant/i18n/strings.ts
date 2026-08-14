import type { Language } from '../types';

type Dict = {
  headerTitle: string;
  headerSubtitle: string;
  newChat: string;
  newChatConfirm: string;
  cancel: string;
  confirm: string;
  newChatBtn: string;
  welcome: string;
  askPlaceholder: string;
  send: string;
  listening: string;
  stop: string;
  tryAgain: string;
  typeInstead: string;
  voiceUnsupported: string;
  listen: string;
  qaMyMachines: string;
  qaOffline: string;
  qaStatus: string;
  qaService: string;
  qaControls: string;
  qaVoice: string;
  online: string;
  offline: string;
  attention: string;
  noError: string;
  viewDetails: string;
  checkStatus: string;
  getService: string;
  controls: string;
  raiseService: string;
  checkMachineFirst: string;
  status: string;
  location: string;
  serviceId: string;
  warranty: string;
  contract: string;
  power: string;
  on: string;
  off: string;
  temperature: string;
  fanSpeed: string;
  mode: string;
  low: string;
  medium: string;
  high: string;
  cool: string;
  fan: string;
  auto: string;
  roomTemp: string;
  setTemp: string;
  humidity: string;
  error: string;
  total: string;
  loadingMachines: string;
  loadingStatus: string;
  loadingService: string;
  loadingCommand: string;
  loadingDetails: string;
  errorGeneric: string;
  tryAgainBtn: string;
  askByVoice: string;
  commandSent: string;
  commandSentDesc: string;
  confirmChangeTitle: string;
  serviceStep1: string;
  serviceStep1Q: string;
  serviceStep2: string;
  serviceStep2Q: string;
  serviceStep3: string;
  serviceStep3Q: string;
  serviceStep4: string;
  serviceStep4Q: string;
  serviceStep5: string;
  serviceReview: string;
  machine: string;
  problem: string;
  prefDate: string;
  prefTime: string;
  edit: string;
  submitRequest: string;
  serviceSuccess: string;
  requestId: string;
  created: string;
  askAnother: string;
  viewRequestDetails: string;
  today: string;
  tomorrow: string;
  chooseDate: string;
  morning: string;
  afternoon: string;
  evening: string;
  chooseTime: string;
  notCooling: string;
  notTurningOn: string;
  strangeNoise: string;
  waterLeakage: string;
  tempProblem: string;
  other: string;
  speakProblem: string;
  next: string;
  back: string;
  selectMachinePrompt: string;
  otherProblemPlaceholder: string;
  open: string;
  inProgress: string;
  closed: string;
  voiceListeningTitle: string;
};

export const STRINGS: Record<Language, Dict> = {
  en: {
    headerTitle: 'AIRA',
    headerSubtitle: 'Your AI Buddy — Ask, speak or choose what you need',
    newChat: 'New chat',
    newChatConfirm: 'Start a new conversation?',
    cancel: 'Cancel',
    confirm: 'Confirm',
    newChatBtn: 'New Chat',
    welcome: "Hi \u{1F44B} I'm AIRA, your AI buddy! How can I help with your AC today?",
    askPlaceholder: 'Ask AIRA about your AC...',
    send: 'Send',
    listening: 'Listening...',
    stop: 'Stop',
    tryAgain: 'Try Again',
    typeInstead: 'Type Instead',
    voiceUnsupported: "Voice input isn't supported on this browser. You can type instead.",
    listen: 'Listen',
    qaMyMachines: 'My Machines',
    qaOffline: 'Check Offline Machines',
    qaStatus: 'Check Machine Status',
    qaService: 'Raise Service Request',
    qaControls: 'Control Machine',
    qaVoice: 'Ask by Voice',
    online: 'Online',
    offline: 'Offline',
    attention: 'Attention Needed',
    noError: 'No Error',
    viewDetails: 'View Details',
    checkStatus: 'Check Status',
    getService: 'Get Service',
    controls: 'Controls',
    raiseService: 'Raise Service',
    checkMachineFirst: 'Check Machine First',
    status: 'Status',
    location: 'Location',
    serviceId: 'Service ID',
    warranty: 'Warranty',
    contract: 'Contract',
    power: 'Power',
    on: 'ON',
    off: 'OFF',
    temperature: 'Temperature',
    fanSpeed: 'Fan Speed',
    mode: 'Mode',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    cool: 'Cool',
    fan: 'Fan',
    auto: 'Auto',
    roomTemp: 'Room Temperature',
    setTemp: 'Set Temperature',
    humidity: 'Humidity',
    error: 'Error',
    total: 'Total',
    loadingMachines: 'Checking your machines...',
    loadingStatus: 'Checking current temperature...',
    loadingService: 'Creating your service request...',
    loadingCommand: 'Sending machine command...',
    loadingDetails: 'Loading machine details...',
    errorGeneric: "Couldn't check the machine right now.",
    tryAgainBtn: 'Try Again',
    askByVoice: 'Ask by Voice',
    commandSent: 'Command Sent',
    commandSentDesc: 'Command sent successfully.',
    confirmChangeTitle: 'Confirm change',
    serviceStep1: 'Step 1 — Machine',
    serviceStep1Q: 'Which machine needs service?',
    serviceStep2: 'Step 2 — Problem',
    serviceStep2Q: 'What problem are you facing?',
    serviceStep3: 'Step 3 — Date',
    serviceStep3Q: 'What day would you prefer?',
    serviceStep4: 'Step 4 — Time',
    serviceStep4Q: 'What time works best?',
    serviceStep5: 'Step 5 — Review',
    serviceReview: 'Service Request',
    machine: 'Machine',
    problem: 'Problem',
    prefDate: 'Preferred Date',
    prefTime: 'Preferred Time',
    edit: 'Edit',
    submitRequest: 'Submit Request',
    serviceSuccess: 'Service Request Created',
    requestId: 'Request ID',
    created: 'Created',
    askAnother: 'Ask Another Question',
    viewRequestDetails: 'View Request Details',
    today: 'Today',
    tomorrow: 'Tomorrow',
    chooseDate: 'Choose Date',
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    chooseTime: 'Choose Time',
    notCooling: 'Not Cooling',
    notTurningOn: 'Not Turning On',
    strangeNoise: 'Strange Noise',
    waterLeakage: 'Water Leakage',
    tempProblem: 'Temperature Problem',
    other: 'Other',
    speakProblem: 'Speak Problem',
    next: 'Next',
    back: 'Back',
    selectMachinePrompt: 'Tap a machine to continue.',
    otherProblemPlaceholder: 'Describe the problem...',
    open: 'Open',
    inProgress: 'In Progress',
    closed: 'Closed',
    voiceListeningTitle: 'AIRA Voice Assistant',
  },
  ar: {
    headerTitle: 'AIRA',
    headerSubtitle: 'رفيقك الذكي — اسأل أو تحدث أو اختر ما تحتاجه',
    newChat: 'محادثة جديدة',
    newChatConfirm: 'بدء محادثة جديدة؟',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    newChatBtn: 'محادثة جديدة',
    welcome: 'مرحباً \u{1F44B} أنا AIRA، رفيقك الذكي! كيف أساعدك في تكييفك اليوم؟',
    askPlaceholder: 'اسأل AIRA عن تكييفك...',
    send: 'إرسال',
    listening: 'جارٍ الاستماع...',
    stop: 'إيقاف',
    tryAgain: 'حاول مرة أخرى',
    typeInstead: 'اكتب بدلاً من ذلك',
    voiceUnsupported: 'الإدخال الصوتي غير مدعوم على هذا المتصفح. يمكنك الكتابة بدلاً من ذلك.',
    listen: 'استمع',
    qaMyMachines: 'أجهزتي',
    qaOffline: 'فحص الأجهزة غير المتصلة',
    qaStatus: 'فحص حالة الجهاز',
    qaService: 'طلب صيانة',
    qaControls: 'تحكم بالجهاز',
    qaVoice: 'اسأل بالصوت',
    online: 'متصل',
    offline: 'غير متصل',
    attention: 'يحتاج اهتمام',
    noError: 'لا يوجد خطأ',
    viewDetails: 'عرض التفاصيل',
    checkStatus: 'فحص الحالة',
    getService: 'اطلب صيانة',
    controls: 'تحكم',
    raiseService: 'اطلب صيانة',
    checkMachineFirst: 'افحص الجهاز أولاً',
    status: 'الحالة',
    location: 'الموقع',
    serviceId: 'رقم الخدمة',
    warranty: 'الضمان',
    contract: 'العقد',
    power: 'التشغيل',
    on: 'تشغيل',
    off: 'إيقاف',
    temperature: 'الحرارة',
    fanSpeed: 'سرعة المروحة',
    mode: 'الوضع',
    low: 'منخفض',
    medium: 'متوسط',
    high: 'عالي',
    cool: 'تبريد',
    fan: 'مروحة',
    auto: 'تلقائي',
    roomTemp: 'حرارة الغرفة',
    setTemp: 'الحرارة المحددة',
    humidity: 'الرطوبة',
    error: 'الخطأ',
    total: 'الإجمالي',
    loadingMachines: 'جارٍ فحص أجهزتك...',
    loadingStatus: 'جارٍ فحص الحرارة الحالية...',
    loadingService: 'جارٍ إنشاء طلب الصيانة...',
    loadingCommand: 'جارٍ إرسال أمر الجهاز...',
    loadingDetails: 'جارٍ تحميل تفاصيل الجهاز...',
    errorGeneric: 'تعذر فحص الجهاز الآن.',
    tryAgainBtn: 'حاول مرة أخرى',
    askByVoice: 'اسأل بالصوت',
    commandSent: 'تم إرسال الأمر',
    commandSentDesc: 'تم إرسال الأمر بنجاح.',
    confirmChangeTitle: 'تأكيد التغيير',
    serviceStep1: 'الخطوة 1 — الجهاز',
    serviceStep1Q: 'أي جهاز يحتاج صيانة؟',
    serviceStep2: 'الخطوة 2 — المشكلة',
    serviceStep2Q: 'ما المشكلة التي تواجهها؟',
    serviceStep3: 'الخطوة 3 — التاريخ',
    serviceStep3Q: 'ما اليوم المفضل لديك؟',
    serviceStep4: 'الخطوة 4 — الوقت',
    serviceStep4Q: 'ما الوقت المناسب لك؟',
    serviceStep5: 'الخطوة 5 — المراجعة',
    serviceReview: 'طلب صيانة',
    machine: 'الجهاز',
    problem: 'المشكلة',
    prefDate: 'التاريخ المفضل',
    prefTime: 'الوقت المفضل',
    edit: 'تعديل',
    submitRequest: 'إرسال الطلب',
    serviceSuccess: 'تم إنشاء طلب الصيانة',
    requestId: 'رقم الطلب',
    created: 'أنشئ',
    askAnother: 'اسأل سؤالاً آخر',
    viewRequestDetails: 'عرض تفاصيل الطلب',
    today: 'اليوم',
    tomorrow: 'غداً',
    chooseDate: 'اختر تاريخاً',
    morning: 'صباحاً',
    afternoon: 'ظهراً',
    evening: 'مساءً',
    chooseTime: 'اختر وقتاً',
    notCooling: 'لا يبرد',
    notTurningOn: 'لا يعمل',
    strangeNoise: 'صوت غريب',
    waterLeakage: 'تسرب ماء',
    tempProblem: 'مشكلة حرارة',
    other: 'أخرى',
    speakProblem: 'تكلم عن المشكلة',
    next: 'التالي',
    back: 'رجوع',
    selectMachinePrompt: 'اضغط على جهاز للمتابعة.',
    otherProblemPlaceholder: 'صف المشكلة...',
    open: 'مفتوح',
    inProgress: 'قيد التنفيذ',
    closed: 'مغلق',
    voiceListeningTitle: 'مساعد AIRA الصوتي',
  },
  hi: {
    headerTitle: 'AIRA',
    headerSubtitle: 'आपका AI बड्डी — पूछें, बोलें या चुनें जो आपको चाहिए',
    newChat: 'नई चैट',
    newChatConfirm: 'नई बातचीत शुरू करें?',
    cancel: 'रद्द करें',
    confirm: 'पुष्टि करें',
    newChatBtn: 'नई चैट',
    welcome: 'नमस्ते \u{1F44B} मैं AIRA हूं, आपका AI बड्डी! आज मैं आपके AC में कैसे मदद करूं?',
    askPlaceholder: 'AIRA से अपने AC के बारे में पूछें...',
    send: 'भेजें',
    listening: 'सुन रहा हूं...',
    stop: 'रोकें',
    tryAgain: 'फिर से कोशिश करें',
    typeInstead: 'टाइप करें',
    voiceUnsupported: 'इस ब्राउज़र पर वॉइस इनपुट समर्थित नहीं है। आप टाइप कर सकते हैं।',
    listen: 'सुनें',
    qaMyMachines: 'मेरी मशीनें',
    qaOffline: 'ऑफलाइन मशीनें जांचें',
    qaStatus: 'मशीन स्थिति जांचें',
    qaService: 'सर्विस अनुरोध',
    qaControls: 'मशीन नियंत्रण',
    qaVoice: 'आवाज से पूछें',
    online: 'ऑनलाइन',
    offline: 'ऑफलाइन',
    attention: 'ध्यान दें',
    noError: 'कोई त्रुटि नहीं',
    viewDetails: 'विवरण देखें',
    checkStatus: 'स्थिति जांचें',
    getService: 'सर्विस लें',
    controls: 'नियंत्रण',
    raiseService: 'सर्विस अनुरोध',
    checkMachineFirst: 'पहले मशीन जांचें',
    status: 'स्थिति',
    location: 'स्थान',
    serviceId: 'सर्विस आईडी',
    warranty: 'वारंटी',
    contract: 'अनुबंध',
    power: 'पावर',
    on: 'चालू',
    off: 'बंद',
    temperature: 'तापमान',
    fanSpeed: 'पंखा गति',
    mode: 'मोड',
    low: 'धीमी',
    medium: 'मध्यम',
    high: 'तेज',
    cool: 'कूल',
    fan: 'पंखा',
    auto: 'ऑटो',
    roomTemp: 'कमरे का तापमान',
    setTemp: 'सेट तापमान',
    humidity: 'नमी',
    error: 'त्रुटि',
    total: 'कुल',
    loadingMachines: 'आपकी मशीनें जांची जा रही हैं...',
    loadingStatus: 'वर्तमान तापमान जांचा जा रहा है...',
    loadingService: 'सर्विस अनुरोध बनाया जा रहा है...',
    loadingCommand: 'मशीन कमांड भेजी जा रही है...',
    loadingDetails: 'मशीन विवरण लोड हो रहा है...',
    errorGeneric: 'अभी मशीन जांच नहीं हो सकी।',
    tryAgainBtn: 'फिर से कोशिश',
    askByVoice: 'आवाज से पूछें',
    commandSent: 'कमांड भेजी गई',
    commandSentDesc: 'कमांड सफलतापूर्वक भेजी गई।',
    confirmChangeTitle: 'बदलाव की पुष्टि करें',
    serviceStep1: 'चरण 1 — मशीन',
    serviceStep1Q: 'किस मशीन को सर्विस चाहिए?',
    serviceStep2: 'चरण 2 — समस्या',
    serviceStep2Q: 'आपको क्या समस्या है?',
    serviceStep3: 'चरण 3 — तारीख',
    serviceStep3Q: 'कौन सा दिन पसंद है?',
    serviceStep4: 'चरण 4 — समय',
    serviceStep4Q: 'कौन सा समय ठीक रहेगा?',
    serviceStep5: 'चरण 5 — समीक्षा',
    serviceReview: 'सर्विस अनुरोध',
    machine: 'मशीन',
    problem: 'समस्या',
    prefDate: 'पसंदीदा तारीख',
    prefTime: 'पसंदीदा समय',
    edit: 'संपादित करें',
    submitRequest: 'अनुरोध जमा करें',
    serviceSuccess: 'सर्विस अनुरोध बनाया गया',
    requestId: 'अनुरोध आईडी',
    created: 'बनाया गया',
    askAnother: 'एक और प्रश्न पूछें',
    viewRequestDetails: 'अनुरोध विवरण देखें',
    today: 'आज',
    tomorrow: 'कल',
    chooseDate: 'तारीख चुनें',
    morning: 'सुबह',
    afternoon: 'दोपहर',
    evening: 'शाम',
    chooseTime: 'समय चुनें',
    notCooling: 'ठंड नहीं कर रहा',
    notTurningOn: 'चालू नहीं हो रहा',
    strangeNoise: 'अजीब आवाज',
    waterLeakage: 'पानी रिसाव',
    tempProblem: 'तापमान समस्या',
    other: 'अन्य',
    speakProblem: 'समस्या बताएं',
    next: 'आगे',
    back: 'पीछे',
    selectMachinePrompt: 'जारी रखने के लिए मशीन चुनें।',
    otherProblemPlaceholder: 'समस्या बताएं...',
    open: 'खुला',
    inProgress: 'प्रगति पर',
    closed: 'बंद',
    voiceListeningTitle: 'AIRA वॉइस सहायक',
  },
};

export function t(lang: Language): Dict {
  return STRINGS[lang];
}
