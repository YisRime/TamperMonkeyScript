// 平台域：题库端点默认表、平台 spec 分派与 JSON.parse 全局钩
import { QuestionType, HAS_DOM } from "./Utils.ts";
import { FrameProbe } from "./Probe.ts";

export const DEFAULT_ENDPOINTS = [
  {
    name: 'icodef-超星',
    url: 'https://cx.icodef.com/wyn-nb?v=4',
    method: 'post',
    contentType: 'form',
    headers: { Authorization: '${token}' },
    data: { question: '${title}', type: '${typeCode}', id: '${id}' },
    resultPath: 'data',
    enabled: true
  },
  {
    name: 'TikuAdapter',
    url: 'http://127.0.0.1:8085/adapter-service/search',
    method: 'post',
    contentType: 'json',
    headers: {},
    data: {
      question: '${title}',
      options: '${optionTexts}',
      type: '${adapterType}'
    },
    resultPath: 'answer.allAnswer',
    blankJoin: '#',
    enabled: false
  }
];

const ZHS_BASE = {
  hosts: ['zhihuishu.com'],
  write: { target: 'label, input, .node_detail', selectedClass: ['onChecked', 'is-checked', 'checked', 'active'] },
  poison: [{ marker: 'richvideo/initdatawithviewer', with: '[]' }]
};

const ICVE_ZJY2_FIELDS = {
  qid: 'id',
  options: { from: 'dataJson', each: 'Content', json: true },
  answer: { from: 'dataJson', each: 'Content', json: true, where: ['IsAnswer', true] }
};

const ICVE_BASE = {
  hosts: ['icve.com.cn', 'courshare.cn', 'webtrn.cn'],
  write: { target: 'label, input, div', selectedClass: ['checkbox_on', 'is-checked', 'checked'] },
  typeCodes: { A1A2题: QuestionType.MULTIPLE, 单选题: QuestionType.SINGLE, 多选题: QuestionType.MULTIPLE, 判断题: QuestionType.JUDGEMENT, 填空题: QuestionType.COMPLETION, 主观题: QuestionType.COMPLETION, 组合题: QuestionType.COMPLETION }
};

const CHAOXING_BASE = {
  hosts: [
    'chaoxing.com', 'xueyinonline.com', 'hnsyu.net', 'qutjxjy.cn', 'ynny.cn', 'hnvist.cn', 'fjlecb.cn',
    'gdhkmooc.com', 'cugbonline.cn', 'zjelib.cn', 'cqrspx.cn', 'neauce.com', 'zhihui-yun.com', 'cqie.cn',
    'ccqmxx.com', 'jxgmxy.com', 'jnzyjsxy.cn', 'sslibrary.com', 'xuexi365.com'
  ],
  iframe: { depth: 3 },
  typeCodes: {
    0: QuestionType.SINGLE, 1: QuestionType.MULTIPLE, 2: QuestionType.COMPLETION, 3: QuestionType.JUDGEMENT,
    4: QuestionType.COMPLETION, 5: QuestionType.COMPLETION, 6: QuestionType.COMPLETION, 7: QuestionType.COMPLETION, 8: QuestionType.COMPLETION,
    9: QuestionType.COMPLETION, 10: QuestionType.COMPLETION, 14: QuestionType.MATCH, 15: QuestionType.MATCH, 11: QuestionType.MATCH
  },
  noise: {
    stemBlock: ['章节测验', '创建空卷', '从题库组卷', '已完卷', '未开始', '展开本卡片', '收起本卡片']
  },
  font: {
    cssClass: 'font-cxsecret',
    resource: 'cxfont',
    url: 'https://cdn.jsdelivr.net/npm/tiku-static-assets@1.0.0/cx_table.json'
  },
  write: {
    target: 'a, label, input[type], .after',
    checked: ['input:checked'],
    judgementRightIcon: '.ri',
    blankSaveButton: '[onclick*="saveQuestion"]',
    matchDisplay: '.chosen-single span'
  }
};

export const SPECS = [
  Object.assign({}, CHAOXING_BASE, {
    key: 'chaoxing-review',
    name: '超星作业查看 / 已批阅测验',
    presence: false,
    exclude: [/dowork/i, /doHomeWorkNew/i, /reVersionTestStartNew/i],
    match: [/mooc2\/work\/view/i, /\/work\/view/i, /selectWorkQuestionYiPiYue/i, /anys\/exam\/testView/i],
    question: {
      root: '.questionLi, .TiMu.singleQuesId, .TiMu',
      stem: 'h3.mark_name .qtContent, .Zy_TItle .clearfix, h3',
      typeText: 'h3.mark_name .colorShallow, .Zy_ulTop .qtInfo',
      options: 'ul.mark_letter li, ul li .after, ul li label:not(.before)',
      answer: '.rightAnswerContent, .correctAnswer .answerCon, .Py_answer span, .correctAnswerBx .correctAnswer.marTop16 p',
      idFrom: '[data], .singleQuesId'
    },
    submit: { globals: [], saveGlobals: [] }
  }),
  Object.assign({}, CHAOXING_BASE, {
    key: 'chaoxing-work',
    name: '超星作业 / 考试',
    exclude: [/work\/phone\//i],
    match: [/mooc2\/work\/dowork/i, /work\/doHomeWorkNew/i, /mooc2\/exam\/preview/i, /exam-ans\/exam\/test\/reVersionTestStartNew/i, /mooc-ans\/exam\/test\/reVersionTestStartNew/i, /mooc2-ans\/work\//i],
    question: {
      root: '.questionLi',
      stem: 'h3 .color4, h3 .mark_name, h3, .stem_h3 .stem-content, .mark_name, .colorShallow',
      options: '.stem_answer .answerBg .answer_p, .answerContent, .textDIV, .eidtDiv, ul li .after',
      typeInput: 'input[id^="answertype"], input[name^="type"]',
      idFrom: 'input[id^="answertype"], input[name^="answer"], li[id]',
      idPattern: '(\\d+)',
      blanks: '.filling_answer textarea, .editing textarea, .eidtDiv textarea',
      matchSlots: '.line_answer_ct .selectBox, .reading_answer, .filling_answer',
      matchItems: 'li[data], span.saveSingleSelect[data]',
      doneMarker: '[class*="check_answer"]'
    },
    pager: { next: '[onclick="getTheNextQuestion(1)"]', timeoutMs: 6000 },
    submit: {
      globals: ['submitCheckTimes', 'escapeBlank', 'submitAction'],
      saveGlobals: ['noSubmit'],
      button: '#submit, .submitBtn, .btnBlue, a[onclick*="submit"]',
      saveButton: '.saveBtn, #save, a[onclick*="save"]'
    }
  }),
  Object.assign({}, CHAOXING_BASE, {
    key: 'chaoxing-chapter',
    name: '超星章节测验',
    match: [/mycourse\/studentstudy/i, /anys\/exam\/test/i, /exam\/test\/reVersionTest/i],
    question: {
      root: '.TiMu',
      stem: '.Zy_TItle .clearfix, .qtContent .newZy_TItle, .Zy_TItle, .firstUlList, .secondUlList',
      options: 'ul li .after, ul li label:not(.before), ul li textarea',
      optionItem: 'ul li',
      typeInput: 'input[id^="answertype"]',
      idFrom: 'input[id^="answertype"]',
      idPattern: '(\\d+)',
      blanks: '.ulChild textarea, ul li textarea',
      matchSlots: '.thirdUlList .dept_select',
      matchItems: 'option',
      matchKey: 'value',
      doneMarker: '.testTit_status_complete'
    },
    submit: {
      globals: ['btnBlueSubmit', 'submitCheckTimes'],
      saveGlobals: ['noSubmit'],
      button: '#btnBlueSubmit, .testBtn .btnBlue, .nextChapter',
      confirm: '#workpop'
    }
  }),
  Object.assign({}, CHAOXING_BASE, {
    key: 'chaoxing-phone',
    name: '超星手机版作业',
    match: [/work\/phone\/doHomeWork/i, /work\/phone\/selectWorkQuestion/i],
    question: {
      root: '.Py-mian1',
      stem: '.Py-m1-title, .m1-title',
      options: '.answerList > li',
      optionItem: '.answerList > li',
      typeInput: 'input[id^="answertype"]',
      idFrom: 'li[id], em[id]',
      idPattern: '(\\d+)',
      blanks: '.filling_answer textarea, textarea'
    },
    submit: {
      globals: ['submitAction', 'escapeBlank', 'submitCheckTimes'],
      saveGlobals: ['noSubmit'],
      button: '#submit, .submit'
    }
  })
];

const B1_SPECS = [
  Object.assign({}, ZHS_BASE, {
    key: 'zhihuishu-exam',
    name: '智慧树作业 / 考试',
    exclude: [/checkHomework/i],
    match: [/stuExamWeb\.html/i, /\/webExamList\/dohomework\//i, /\/webExamList\/doexamination\//i],
    capture: [{
      source: 'xhr',
      marker: 'workExamParts',
      shape: ['rt.examBase.workExamParts'],
      list: 'rt.examBase.workExamParts[].questionDtos[]',
      children: 'questionChildrens',
      fields: { qid: 'id', question: 'name', typeLabel: 'questionType.name', options: 'questionOptions[].content', optionsId: 'questionOptions[].id' }
    }],
    question: {
      root: '.examPaper_subject',
      stem: '.subject_describe div, .smallStem_describe p',
      options: '.subject_node .nodeLab .node_detail',
      typeText: '.subject_type span',
      blanks: '.subject_node textarea, .subject_node .edui-body-container'
    },
    submit: {
      answerCard: '.answerCard_list ul li',
      answerCardNext: 'div.examPaper_box > div.switch-btn-box > button:nth-child(2)'
    }
  }),
  Object.assign({}, ZHS_BASE, {
    key: 'zhihuishu-credit-homework',
    name: '智慧树学分课作业',
    match: [/atHomeworkExam\/stu\/homeworkQ\/exerciseList/i, /atHomeworkExam\/stu\/examQ\/examexercise/i],
    question: {
      root: '.questionBox',
      stem: '.questionContent',
      options: '.optionUl label .el-radio__label, .optionUl .el-checkbox__label',
      clickables: '.optionUl label',
      typeText: '.questionTit',
      blanks: '.questionBox textarea'
    },
    pager: { next: { selector: '.Topicswitchingbtn', text: ['下一题'] }, timeoutMs: 5000 }
  }),
  Object.assign({}, ZHS_BASE, {
    key: 'zhihuishu-exam-h5',
    name: '智慧树学分课考试',
    match: [/studentexambaseh5\.zhihuishu\.com/i],
    question: {
      root: '.ques-detail',
      stem: '.questionName .centent-pre',
      options: '.radio-view li .preStyle, .checkbox-views label .preStyle',
      clickables: '.radio-view li, .checkbox-views label',
      typeText: '.letterSortNum',
      blanks: '.ques-detail textarea'
    },
    pager: { next: { selector: '.next-topic', text: ['下一题'] }, timeoutMs: 5000 }
  }),
  Object.assign({}, ICVE_BASE, {
    key: 'icve-exam',
    name: '职教云考试',
    match: [/\/exam\/examflow_index\.action/i],
    question: {
      root: '.q_content',
      stem: '.divQuestionTitle',
      options: '.questionOptions .q_option',
      clickables: '.questionOptions .q_option div',
      typeInput: '[answertype]',
      typeAttribute: 'answertype',
      blanks: 'div[id^=_baidu_editor_], textarea'
    },
    pager: { next: '.paging_next', timeoutMs: 6000 },
    submit: {
      firstCard: ".sheet_nums [id*='sheetSeq']"
    }
  }),
  Object.assign({}, ICVE_BASE, {
    key: 'icve-directory',
    name: '职教云章节测验',
    match: [/\/study\/directory\/dir_course\.html/i],
    question: {
      root: '.panel_item .panel_item',
      stem: '.preview_cm .preview_stem',
      options: '.preview_cm ul li span:last-child',
      clickables: '.preview_cm ul li input',
      typeText: '.panel_title',
      blanks: '.preview_cm textarea'
    }
  }),
  Object.assign({}, ICVE_BASE, {
    key: 'icve-mooc',
    name: '职教云 MOOC / 安徽继续教育 / 上海开大',
    hosts: ['icve.com.cn', 'jxjyxy.com', 'shanghai-open.com', 'ouchoa.cn'],
    match: [/\/study\/homework\/do\.html/i, /\/study\/workExam\/testWork\/preview\.html/i, /\/study\/onlineExam\/preview\.html/i, /\/study\/workExam\/homeWork\/preview\.html/i, /\/study\/workExam\/onlineExam\/preview\.html/i, /\/study\/html\/content\/(studying|tkOnline|sxsk|bkExam)\//i, /\/study\/assignment\/(preview|continuation)\.aspx/i],
    question: {
      root: '.e-q, .e-q-r',
      stem: '.e-q-q .ErichText',
      options: '.e-a-g li',
      typeText: '.quiz-type, .topic_type',
      blanks: '.e-q-r textarea'
    }
  }),
  Object.assign({}, ICVE_BASE, {
    key: 'icve-library',
    name: '智慧职教 / 资源库 作业 考试',
    match: [/icve-study\/(coursePreview\/)?(jobTest|keepTest|test)\b/i, /\/study\/spoc(keep|job)?Test\b/i, /\/study\/courseteaching\/test\/homeWork/i, /zjy2\.icve\.com\.cn/i, /\/study\/(works\/works|exam\/exam)\.html/i],
    capture: [
      { source: 'jsonparse', shape: ['paper'], list: 'paper.PaperQuestions[]', fields: { id: 'Id', question: 'ContentText', options: 'Selects', answer: 'Answers', typeLabel: 'ACHType.QuestionTypeName' } },
      { source: 'jsonparse', shape: ['array'], list: 'array[].Questions[]', fields: { id: 'Id', question: 'ContentText', options: 'Selects', answer: 'Answers', typeLabel: 'ACHType.QuestionTypeName' } },
      { source: 'jsonparse', shape: ['name', 'questions', 'totalScore'], list: 'questions', fields: ICVE_ZJY2_FIELDS },
      { source: 'jsonparse', shape: ['data.questions'], list: 'data.questions', fields: ICVE_ZJY2_FIELDS }
    ],
    question: {
      root: '.subjectDet, .questions',
      stem: 'h5, h2, h3, h4, h6, .titleTest span:not(.xvhao), .titleT .htmlP, .preview_stem, .questionContent',
      options: '.optionList .el-radio__label, .optionList .el-checkbox__label, .optionList label, li .preview_cont',
      clickables: '.optionList input, li input',
      typeText: '.title, .titleTwo, .titleTest .xvhao, .quiz-type',
      typeInput: 'input[type=hidden]',
      blanks: '.fillblank_answer textarea, textarea'
    }
  }),
  {
    key: 'yunbanke',
    name: '云班课',
    hosts: ['mosoteach.cn'],
    match: [[/\/web\/index\.php/i, /[?&]m=reply/]],
    write: { target: '.el-radio__input, .el-checkbox__input, label, input', selectedClass: ['is-checked'] },
    question: {
      root: '.topic-item',
      stem: '.t-con .t-subject',
      options: '.t-option label .option-content, .option-content',
      clickables: '.el-radio__input, .el-checkbox__input',
      typeText: '.t-info .t-type',
      blanks: '.topic-item textarea, .topic-item input[type=text]'
    }
  },
  {
    key: 'qingshuxuetang',
    name: '青书学堂 考试 / 测验',
    hosts: ['qingshuxuetang.com'],
    match: [/\/Student\/MakeupExamPaper/i, /Student\/ExamPaper/i, /\/Student\/ExercisePaper/i, /\/Student\/SimulationExercise/i, /quiz\.qingshuxuetang\.com/i],
    write: { target: 'label, input' },
    question: {
      root: '.question-detail-container',
      stem: '.question-detail-description .detail-description-content, .question-detail-description span',
      options: '.question-detail-options label .option-description',
      clickables: '.question-detail-options label input, .question-detail-options label',
      typeText: '.question-detail-type-desc, .question-detail-type',
      blanks: 'div[id^=cke_editor], .question-detail-solution-textarea'
    }
  },
  {
    key: 'ouchn-exam',
    name: '国家开放大学 考试',
    hosts: ['ouchn.cn', 'hblll.com'],
    match: [[/lms\.ouchn\.cn|lms\.cjzx\.hblll\.com/i, /\/exam\//i]],
    write: { target: 'label, .left, input', selectedClass: ['ng-not-empty', 'is-checked'] },
    question: {
      root: '.single_selection, .multiple_selection, .true_or_false, .short_answer',
      stem: '.summary-title .subject-description',
      options: '.subject-options li .option-content',
      clickables: '.subject-options label .left, .subject-options label',
      typeText: '.summary-sub-title span',
      blanks: '.short_answer textarea, .short_answer input'
    },
    capture: [{
      source: 'jsonparse',
      marker: 'subjects_data',
      shape: ['subjects_data.subjects'],
      list: 'subjects_data.subjects',
      fields: {
        id: 'id',
        question: 'description',
        typeLabel: 'type',
        options: { from: 'options', json: true, each: 'content' },
        answer: { from: 'options', json: true, each: 'content', where: ['is_answer', true] }
      }
    }]
  },
  {
    key: 'renwei-mooc',
    name: '人卫慕课测验',
    match: [/\/memberFront\/paper\.zhtml/i],
    write: { target: 'label, input' },
    question: {
      root: '.quesinfo',
      stem: 'dl dt',
      options: 'dd label',
      clickables: 'dd input',
      blanks: '.quesinfo textarea'
    }
  }
];

const B2_SPECS = [
  Object.assign({}, ZHS_BASE, {
    key: 'zhihuishu-hike-work',
    name: '智慧树 AI 课程作业',
    hosts: ['zhihuishu.com', 'polymas.com'],
    match: [/\/stu-hike\/stuHomeworkDo/i],
    write: {
      target: '.el-radio__input:not(.is-checked), .el-checkbox__input:not(.is-checked), label, input',
      selectedClass: ['onChecked', 'is-checked', 'checked', 'active']
    },
    question: { root: '.q_main', stem: '.question-topic', options: 'label', typeText: '.question_score' },
    pager: { next: '.check_btn:not(.is-disabled)', timeoutMs: 6000 }
  }),
  Object.assign({}, ZHS_BASE, {
    key: 'zhihuishu-hike-homework',
    name: '智慧树 AI 课程题目作业',
    hosts: ['zhihuishu.com', 'polymas.com'],
    match: [/\/stu\/answer-homework/i, /\/stu-exam\/answer-exam/i],
    question: {
      root: '.question-item',
      stem: '.qeustion-content, .combination-content',
      options: '.option-item, .vditor-content',
      typeText: '.title-box, .combination-title',
      blanks: '.vditor-reset'
    }
  }),
  Object.assign({}, ZHS_BASE, {
    key: 'zhihuishu-smart-exam',
    name: '智慧树新形态考试',
    match: [/examloop\.zhihuishu\.com\/exam/i],
    write: { checked: ['div.bg-mainBg'], selectedClass: ['onChecked', 'is-checked'] },
    question: {
      root: '.question-area-content',
      stem: 'div.flex-1 .mb-\\[32px\\] .text-mainText.font-medium',
      options: 'label.user-select, div.real-editor',
      typeText: 'div.flex.items-center.mb-\\[16px\\]',
      blanks: 'div.real-editor, input'
    },
    pager: { next: { selector: 'button', text: ['下一题'] }, timeoutMs: 6000 }
  }),
  Object.assign({}, ICVE_BASE, {
    key: 'icve-ai-work',
    name: '智慧职教 AI 作业',
    match: [/ai\.icve\.com\.cn\/preview-exam/i],
    write: { target: 'label, input', checked: ['.ivu-radio-checked'], selectedClass: ['ivu-radio-checked', 'checked'] },
    question: {
      root: '.content-item, .paper-content .questions',
      stem: '.questions-content [class*=title-content], .single-title-content, .multiple-title-content, .judge-title',
      options: 'label[class*=group-item], .ivu-input-wrapper input, .single-item-xxnr, .multiple-item-xxnr, .judge-item-xxnr',
      typeText: '.single-title-num, .multiple-title-num, .judge-title-num',
      blanks: '.ivu-input-wrapper input'
    },
    pager: { next: 'div.center_btn > button:nth-child(2), .ivu-btn', timeoutMs: 6000 }
  }),
  {
    key: 'icourse-work',
    name: '中国大学MOOC 作业 / 考试',
    hosts: ['icourse163.org'],
    match: [/icourse163\.org\/learn/i, /icourse163\.org\/spoc\/learn/i, /\/mooc\/main\/newExam/i],
    exclude: [/learn\/quizscore/i, /examObjectScore/i],
    write: { target: 'input, .f-richEditorText, .richEditor-text', judgementRightIcon: '.u-icon-correct' },
    question: {
      root: '.u-questionItem, [class*=questionBody]',
      stem: '.j-title .j-richTxt, [class*=questionInfo]',
      options: '.choices li, .inputArea, [class*=index-module__optionBody]',
      clickables: 'input',
      blanks: '.inputArea textarea'
    },
    submit: { button: '.j-submit' }
  },
  {
    key: 'jijiaool-exam',
    name: '继教网 / 教师教育 在线考试',
    hosts: ['jijiaool.com', 'courshare.cn', 'jsnu.edu.cn', 'nwnu.jijiaool.com', 'cj-edu.com', 'hnscen.cn', 'ycjy.lut.edu.cn', 'beihua.peishenjy.com', 'cj1026-kfkc.webtrn.cn'],
    match: [/\/learnspace\/course\/test/i, /\/Student\/ExamManage\/CourseOnlineExamination/i, [/cj-edu\.com|hnscen\.cn|jijiaool\.com|lut\.edu\.cn|peishenjy\.com|webtrn\.cn/i, /\/Exam(Info|ination)/i]],
    write: { target: 'label, input', selectedClass: ['is-checked'] },
    question: {
      root: '.test_item',
      stem: '.test_item_tit',
      options: '.test_item_theme label .zdh_op_con, .test_item_theme label',
      clickables: '.test_item_theme label input, label input',
      typeText: '.test_item_type'
    }
  },
  {
    key: 'jsou-exam',
    name: '江苏开放 / 河开 学习平台作业',
    hosts: ['jsou.cn', 'open.ha.cn'],
    match: [/\/jxpt-web\/student\/(new)?Homework\/showHomeworkByStatus/i],
    write: { target: '.numberCover, label, input', selectedClass: ['answer-title'] },
    question: {
      root: '.insert',
      stem: '.window-title',
      options: '.questionId-option .option-title div, ul li div:last-child',
      clickables: '.questionId-option .option-title .numberCover, ul li .numberCover',
      typeInput: '.question-type',
      typeCodes: { 1: QuestionType.SINGLE, 2: QuestionType.MULTIPLE, 7: QuestionType.JUDGEMENT }
    }
  },
  {
    key: 'wencai-exam',
    name: '柠檬文才 作业 / 考试',
    hosts: ['wencaischool.net', 'zk211.com', 'wuxuejiaoyu.cn'],
    match: [/\/separation\/exam\//i, /\/(hb|xbsf|open|jx|shandong)learning\/exam\//i, /\/exam\/index\.html#\/exam\?studentId/i],
    write: { target: 'label, input' },
    question: {
      root: '.paperWrapper .tmList',
      stem: '.tmTitleTxt',
      options: '.ansbox .opCont',
      clickables: '.ansbox input'
    }
  },
  {
    key: 'zjooc-exam',
    name: '在浙学 / 浙江开放大学',
    hosts: ['zjooc.cn'],
    match: [[/zjooc\.cn/i, /\/(homework|test|exam|singleQuestion\/do)\//i]],
    write: { target: 'label, input', selectedClass: ['is-checked'] },
    question: {
      root: '.questiono-item, .question_content',
      stem: '.question_title, h6 .processing_img',
      options: '.questiono-main label .el-radio__label, .el-checkbox__label, .radio_content div',
      clickables: '.questiono-main label, .question_content label',
      typeText: '.topic_type'
    }
  },
  {
    key: 'ulearning-exam',
    name: '优学院 / UMOOC',
    hosts: ['ulearning.cn', 'umooc.com.cn'],
    match: [/\/learnCourse\/learnCourse\.html/i, /\/quiz\/pc\.html/i, /\/umooc\/learner\/homework\.do/i, /utest\.ulearning\.cn/i],
    write: { target: 'label, input, .iconfont', selectedClass: ['selected', 'is-checked', 'checkbox-checked'] },
    question: {
      root: '.question-item, .split-screen-wrapper, .multiple-choices, .judge',
      stem: '.question-title, .question-title-html, h5 .position-rltv span',
      options: 'ul label .choice-title, .choice-list .content-wrapper .text, .choice-list label .rich-text, ul label span',
      clickables: 'ul label input, .choice-list .checkbox, .choice-list label, .radios .radio input',
      typeText: '.title, .question-type-tag, .typeName, .base-question .title .tip'
    }
  },
  {
    key: 'moodle-ouchn',
    name: '国开系 moodle 测验（广开 / 北京开大 / 湖北青开）',
    hosts: ['moodle.syxy.ouchn.cn', 'xczxzdbf.moodle.qwbx.ouchn.cn', 'elearning.bjou.edu.cn', 'course.ougd.cn', 'study.ouchn.cn', 'whkpc.hnqtyq.cn'],
    match: [/\/mod\/quiz\/attempt\.php/i],
    write: { target: 'label, input', checked: ['input:checked'] },
    question: {
      root: '.que',
      stem: '.qtext',
      options: '.answer div label, .flex-fill',
      clickables: '.answer div input',
      blanks: 'input[id$=_answer]'
    },
    submit: { button: '.submitbtns .btn-primary' }
  },
  {
    key: 'wenjuan-exam',
    name: '问卷星 考试',
    hosts: ['wenjuan.com'],
    match: [/\/exam\/ExamRd\/Answer/i],
    write: { target: 'label, .xuanxiang', selectedClass: ['checked', 'ichecked', 'is-checked'] },
    question: {
      root: '.g-mn',
      stem: '.m-question .tigan',
      options: '.question-block .xuanxiang',
      clickables: '.question-block .xuanxiang',
      typeText: '.tixing'
    },
    pager: { next: { selector: '.u-btn-next', text: ['下一题'] }, timeoutMs: 6000 }
  },
  {
    key: 'yinghua-exam',
    name: '英华学堂 作业 / 考试',
    hosts: ['mooc.kdcnu.com', 'mooc.yncjxy.com', 'mooc.cdcas.com', 'mooc.cqcst.edu.cn', 'mooc.kmcc.edu.cn', 'mooc.wuhues.com'],
    match: [/\/user\/(work|exam)/i],
    write: { target: 'label, .exam-inp', checked: ['input:checked'], selectedClass: ['checked', 'active'] },
    question: {
      root: '.courseexamcon-main',
      stem: '.name',
      options: '.list li .txt',
      clickables: '.list li .exam-inp',
      typeText: '.type'
    },
    pager: { next: '.next_exam', timeoutMs: 6000 }
  }
];

const B3_SPECS = [
  {
    key: 'chaoxing-inclass-quiz',
    name: '超星随堂测验',
    match: [/\/page\/quiz\/stu\/answerQuestion/i],
    question: { root: '.question-item', stem: '.topic-txt', options: '.topic-option-list', clickables: '.topic-option-list input', typeInput: 'input[class^=que-type]' }
  },
  {
    key: 'examcloud-exam',
    name: '广东开大 exam-cloud 考试系统',
    hosts: ['gdrtvu.exam-cloud.cn'],
    match: [[/gdrtvu\.exam-cloud\.cn/i, /examRecordData/i]],
    question: { root: '.question-container', stem: '.question-body', options: '.option .question-options', clickables: '.option input', typeText: '.question-header .container',
      stemSplit: '[A-G]\\.', stemNumber: { items: '.item', current: '.current-question', label: '【第${n}小题】' }, stemExtra: '.right .question-view .question-body' }
  },
  {
    key: 'cug-exam',
    name: '中国地质大学 在线考试',
    match: [/\/Exam\/OnlineExamV2\//i],
    question: { root: '.stViewItem', stem: '.stViewHead div', options: '.stViewCont .stViewOption a', clickables: '.stViewCont .stViewOption a, input',
      typeText: { at: 'prev', up: 2, find: '.E_E_L_I_C_R_C_T_SubType' } }
  },
  {
    key: 'wanxue-exam',
    name: '万学 N2014 学习系统',
    match: [/\/sls\/N2014_StudyController\/next/i],
    question: { root: '.question', stem: 'tr .nm2', options: '.grey td p', clickables: '.option li label', typeText: 'tr .nm2' }
  },
  {
    key: 'xueqi-test',
    name: '学起（职教云 oxer）测试',
    match: [/\/oxer\/page\/ots\/UniversityStart\.html/i],
    write: { target: 'label, input', selectedClass: ['lichecked'] },
    question: { root: '.uniQueItem', stem: '.QueStem', options: 'ul li span', clickables: 'ul li',
      typeText: { at: 'closest', within: '.uniQueList', find: '.fir' } }
  },
  {
    key: 'goldgame-test',
    name: '金牌学堂 测评',
    hosts: ['www.goldgame.com.cn'],
    match: [[/www\.goldgame\.com\.cn/i, /\/TestPage/i]],
    question: { root: '.test-type-box ul .white-bg', stem: '.position-relative h3', options: '.test-option label p:last-child', clickables: '.test-option label input', typeText: { at: 'self', up: 2, find: '.test-type-tips' } },
    pager: { next: '.answer-sheet li', timeoutMs: 6000 }
  },
  {
    key: 'qdouchn-exam',
    name: '青岛开放大学 考试',
    match: [/\/pages\/exam\/exam\.html/i],
    question: { root: '.exam-content-block .exam-content-topic', stem: '.exam-topic-title', options: '.exam-topic-answer .layui-unselect span', clickables: '.exam-topic-answer .layui-unselect', typeText: { at: 'parent', find: '.exam-content-title .exam-content-num' } }
  },
  {
    key: 'bsmy-exam',
    name: '警官学院 考试',
    match: [/\/bsmytest\/startTi\.do/i],
    question: { root: '.wrapper > div', stem: '.dx', options: 'p', clickables: 'p input', typeText: { at: 'parent', find: 'h2' } }
  },
  {
    key: 'euibe2-exam',
    name: '对外经贸 exam2 考试',
    hosts: ['exam2.euibe.com'],
    match: [[/exam2\.euibe\.com/i, /\/KaoShi\/ShiTiYe\.aspx/i]],
    question: { root: '.question', stem: '.wenti', options: 'li label span', clickables: 'li label', typeText: { at: 'page', find: '.question_head' } },
    pager: { next: '.paginationjs-next', timeoutMs: 6000 }
  },
  {
    key: 'zzx-ouchn-exam',
    name: '中央电中 zzx 学习平台考试',
    hosts: ['zzx.ouchn.edu.cn'],
    match: [[/zzx\.ouchn\.edu\.cn/i, /\/edu\/public\/student\//i]],
    question: { root: '.subject', stem: '.question span', options: '.answer>span>p:first-child' }
  },
  {
    key: 'havust-exam',
    name: '华科航天 hnscen 考试',
    hosts: ['havust.hnscen.cn'],
    match: [[/havust\.hnscen\.cn/i, /\/stuExam\/examing\//i]],
    question: { root: '.main .mt_2 > div', stem: '.flex_row+div', options: '.flex_row+div+div .el-radio__label, .el-checkbox__label', typeText: '.flex_row .mr_2' }
  },
  {
    key: 'mhtall-exam',
    name: 'mhtall 学习平台 练习',
    hosts: ['learning.mhtall.com'],
    match: [[/learning\.mhtall\.com/i, /\/rest\/course\/exercise\/item/i]],
    question: { root: '#div_item', stem: '.item_title', options: '.opt div label', clickables: '.opt div input:not(.button_short)', typeText: 'h4' }
  },
  {
    key: 'wang168-test',
    name: '168网校 测验',
    hosts: ['168wangxiao.com'],
    match: [[/168wangxiao\.com/i, /\/web\/learningCenter\/details\//i]],
    question: { root: '.question-item-container', stem: '.title-content', options: '.options .opt-content', clickables: '.options label', typeText: '.top .type' }
  },
  {
    key: 'wang168-exam',
    name: '168网校 考试',
    hosts: ['168wangxiao.com'],
    match: [[/168wangxiao\.com/i, /\/web\/examination\/answer/i]],
    question: { root: '.Answer-area', stem: '.listTit', options: '.el-radio__label span:last-child, .el-checkbox__label span:last-child', clickables: '.el-radio__input, .el-checkbox__input input, .ql-editor p' },
    pager: { next: { selector: '.ctrl .el-button', text: ['下一题'] }, timeoutMs: 6000 }
  },
  {
    key: 'faxuan-exam',
    name: '法宣在线 考试',
    hosts: ['faxuanyun.com'],
    match: [[/faxuanyun\.com/i, /\/bps\/examination/i]],
    question: { root: '#timucontent', stem: 'h2', options: 'ul li', clickables: 'ul input' },
    pager: { next: '#nextButton', timeoutMs: 6000 }
  },
  {
    key: 'hexuezx-exam',
    name: '和学在线 考试',
    hosts: ['student.hexuezx','student.jxjyzx'],
    match: [/student\.hexuezx|student\.jxjyzx/i],
    question: { root: '.el-card__body', stem: '.stem', options: '.el-radio__label, .el-checkbox__label span', clickables: '.el-radio__input, .el-checkbox__input input' }
  },
  {
    key: 'cqooc-exam',
    name: '高教在线（cqooc）考试 / 测验',
    hosts: ['www.cqooc.com'],
    match: [[/www\.cqooc\.com/i, /\/learn\/mooc\/exam\/do/i], [/www\.cqooc\.com/i, /\/learn\/mooc\/testing\/do/i]],
    question: { root: '#test-form .cat', stem: '.stem', options: '.option label', clickables: '.option input' }
  },
  {
    key: 'qnzzxy-exam',
    name: 'qnzzxy 考试平台',
    match: [/\/kaoshi_qnzzxy\/kaoshi\.html/i],
    question: { root: '.form-group', stem: '.row-fluid', options: '.option', clickables: '.option input', typeText: { at: 'parent', find: 'div:first' } }
  },
  {
    key: 'wencai-alone-exam',
    name: '柠檬文才 独立考试',
    hosts: ['exam.wencaischool.net'],
    match: [[/exam\.wencaischool\.net/i, /\/exam\?studentId/i]],
    question: { root: '.paperWrapper .tmList .tmc', stem: '.tmTitleTxt', options: '.ansbox .opCont', clickables: '.ansbox input' }
  },
  {
    key: 'fjnu-neo-exam',
    name: '福建师范大学 neo 平台',
    hosts: ['neo.fjnu.cn'],
    match: [[/neo\.fjnu\.cn/i, /\/resource\/index/i]],
    question: { root: '.content', stem: '.title', options: 'label .el-radio__label, .el-checkbox__label', clickables: 'label input' }
  },
  {
    key: 'youkexuetang-exam',
    name: '优课学堂 考试',
    hosts: ['youkexuetang.cn'],
    match: [[/youkexuetang\.cn/i, /\/student\//i]],
    question: { root: '.paperItemBox', stem: '.stem', options: '.el-radio__label, .el-checkbox__label', clickables: '.el-radio__input, .el-checkbox__input input' }
  },
  {
    key: 'kaoshixing-exam',
    name: '考试星（单题模式）',
    hosts: ['exam.kaoshixing.com'],
    match: [[/exam\.kaoshixing\.com/i, /\/exam\/exam_start/i]],
    question: { root: '.questions .questions-content', stem: '.question-name', options: '.answers label .words', clickables: '.answers label' },
    pager: { next: { selector: '#nextQuestions', text: ['下一题'] }, timeoutMs: 6000 }
  },
  {
    key: 'beeouc-exam',
    name: '易考云 考试',
    hosts: ['exam.beeouc.com'],
    match: [[/exam\.beeouc\.com/i, /\/client/i]],
    question: { root: '.question-body', stem: '.question-stem', options: '.question-option label', clickables: '.question-option input', typeText: '.question-type' },
    pager: { next: { selector: '.question-footer button', text: ['下一题'] }, timeoutMs: 6000 }
  },
  {
    key: 'ylsf-exam',
    name: '伊犁师范成人教育 考试',
    match: [/\/learn\/NewExam/i, /\/\/GeneralTestPaper\/Testing\//i, /\/\/GeneralTestPaper\/SNTesting/i],
    question: { root: '.topic', stem: '.qsctt', options: '.xuan li', clickables: '.choice input' }
  },
  {
    key: 'ytccr-work',
    name: '绎通云课堂 作业',
    hosts: ['ytccr.com'],
    match: [[/ytccr\.com/i, /#\/learning-work/i], [/ytccr\.com/i, /#\/learning-details/i]],
    question: { root: '.border-item', stem: '.qa-title', options: 'label .opt-title-cnt', clickables: 'label input' }
  },
  {
    key: 'cqu5any-work',
    name: '重庆大学网络教育学院 作业',
    hosts: ['exercise.5any.com'],
    match: [[/exercise\.5any\.com/i, /\/Exercise\/WebUI\/Test\/Answer/i]],
    question: { root: '.subject .font-16', stem: '.stem .richtextcontent', options: '.option .richtextcontent', clickables: '.option label input' }
  },
  {
    key: 'bjyz-exam',
    name: '毕节幼儿师范 考试',
    hosts: ['px.gzbjyzjxjy.cn','px.ggcjxjy.cn'],
    match: [[/px\.gzbjyzjxjy\.cn|px\.ggcjxjy\.cn/i, /\/exam\/shiti\/dopapers/i]],
    question: { root: '.panel-body>div', stem: '.testpaper-question-stem', options: '.testpaper-question-choices li', clickables: '.testpaper-question-footer input' }
  },
  {
    key: 'gzjxjy-exam',
    name: '贵州继续教育 考试',
    hosts: ['www.gzjxjy.gzsrs.cn'],
    match: [[/www\.gzjxjy\.gzsrs\.cn/i, /\/personback\//i]],
    question: { root: '.question-title', stem: '.show-text', options: 'label', clickables: 'label input' }
  },
  {
    key: 'hexuezikao-exam',
    name: '和学自考 考试',
    hosts: ['zkpt.qdu.edu.cn'],
    match: [[/zkpt\.qdu\.edu\.cn/i, /\/examStu\/exam\/examPaper/i]],
    question: { root: '.ant-row', stem: { at: 'prev', up: 2 }, options: 'label', clickables: 'label input' }
  },
  {
    key: 'zgzjzj-exam',
    name: '专技天下 考试',
    hosts: ['zgzjzj.com'],
    match: [[/zgzjzj\.com/i, /\/examination\/perpar\.html/i]],
    write: { target: 'label, input', selectedClass: ['active'] },
    question: { root: '.question_index', stem: 'p', options: '.options li p, li>span:last-child', clickables: '.options li', typeText: 'p span' }
  },
  {
    key: 'euibe-exam',
    name: '对外经贸 exam 考试',
    hosts: ['exam.euibe.com'],
    match: [[/exam\.euibe\.com/i, /\/KaoShi\/ShiTiYe\.aspx/i]],
    question: { root: '.question', stem: '.wenti .stem', options: 'label span', clickables: 'label input',
      typeText: { at: 'closest', within: '.question_list', find: '.question_head' } },
    pager: { next: '.paginationjs-next', timeoutMs: 6000 }
  },
  {
    key: 'xuehui-exam',
    name: '学晖教育 题库刷题',
    hosts: ['xhjy.ldzxjy.com'],
    match: [[/xhjy\.ldzxjy\.com/i, /tikuUserBatch\/keepTopic/i]],
    question: { root: '.radio', stem: '.issueTitle', options: 'ul li span', clickables: 'ul li', typeText: '.issueTypes' },
    pager: { next: { selector: '.next', text: ['下一题'] }, timeoutMs: 6000 }
  },
  {
    key: 'edufe-exam',
    name: '东财在线 练习 / 作业',
    hosts: ['classroom.edufe.com.cn'],
    match: [[/classroom\.edufe\.com\.cn/i, /\/PracticePaper/i], [/classroom\.edufe\.com\.cn/i, /\/HomeWorkPaper/i]],
    write: { target: 'label, input', selectedClass: ['_CheckBox_checked'] },
    question: { root: '.CBTPaperMain-trunk', stem: '.CBTPaperMain-divInline', options: 'ul li label' }
  },
  {
    key: 'lidapoly-exam',
    name: '上海立达学院 考试',
    hosts: ['kkzxsx.lidapoly.edu.cn'],
    match: [[/kkzxsx\.lidapoly\.edu\.cn/i, /\/exam\//i]],
    write: { target: 'label, input', selectedClass: ['is-checked'] },
    question: { root: '.main .item', stem: '.text', options: '.options label .el-radio__label, .el-checkbox__label', clickables: '.options label', typeText: { at: 'parent', find: '.text' } }
  },
  {
    key: 'sjztkj-exam',
    name: '石家庄科技继续教育 考试',
    hosts: ['kc.jxjypt.cn'],
    match: [[/kc\.jxjypt\.cn/i, /\/paper\/start/i]],
    write: { target: 'label, input', selectedClass: ['cho-this'] },
    question: { root: '.sub-content', stem: '.sub-dotitle', options: '.sub-answer dd', clickables: '.sub-answer dd, .mater-respond textarea', typeText: '.sub-dotitle i' }
  },
  {
    key: 'jundun-exam',
    name: '国开军盾 考试',
    hosts: ['s.jundunxueyuan.com'],
    match: [[/s\.jundunxueyuan\.com/i, /#\/exam\//i]],
    question: { root: '.section-item-question-item', stem: '.question-tit', options: '.el-radio-group label, .el-checkbox-group label', clickables: '.el-radio-group input, .el-checkbox-group input',
      typeText: { at: 'closest', within: '.section-item', find: '.section-item-tit' } }
  },
  {
    key: 'bossyun-exam',
    name: '博学 bossyun 考试',
    hosts: ['bx.bossyun.com'],
    match: [[/bx\.bossyun\.com/i, /\/bx\/study\/examine/i]],
    question: { root: '.question-list', stem: '.title', options: '.ant-radio-group label, .ant-checkbox-group label', clickables: '.ant-radio-group input, .ant-checkbox-group input', typeText: '.tag' }
  },
  {
    key: 'oldzzx-exam',
    name: '电中在线（old-zzx）考试',
    hosts: ['old-zzx.ouchn.edu.cn'],
    match: [[/old-zzx\.ouchn\.edu\.cn/i, /\/edu\/public\/student\//i]],
    question: { root: '.subject', stem: '.question', options: '.answer .option-name', clickables: '.answer' }
  },
  {
    key: 'ixuejiao-exam',
    name: '爱学（ztbu / 51ixuejiao）考试',
    hosts: ['ai.ztbu.edu.cn','www.51ixuejiao.com'],
    match: [[/ai\.ztbu\.edu\.cn|www\.51ixuejiao\.com/i, /\/Web\/Test\/doing/i]],
    question: { root: '.exam dd', stem: 'card-title', options: '.ans_area div', typeText: 'info' }
  },
  {
    key: 'ipmph-exam',
    name: '人卫智网 校内考试',
    hosts: ['exam.ipmph.com'],
    match: [[/exam\.ipmph\.com/i, /\/front\/myschool\/index\.html/i]],
    question: { root: '.body', stem: '.fch2 font', options: '.selet .el-radio__label', clickables: '.selet input' },
    pager: { next: '#next_btn', timeoutMs: 6000 }
  },
  {
    key: 'zbwsrc-exam',
    name: '卫生人力资源系统（vgos）考试',
    hosts: ['vgos.zbwsrc.cn'],
    match: [[/vgos\.zbwsrc\.cn/i, /\/TESExamClient\//i]],
    question: { root: '.testitem', stem: '.stem', options: '.inputitem li', clickables: '.inputitem input' }
  },
  {
    key: 'peixun-exam',
    name: '培训系统 考试（ShowItemView）',
    match: [/ShowItemView/i],
    question: { root: '.choice-interaction', stem: '.select-clickstyle span', options: '.text-simple-choice .text', clickables: '.text-simple-choice input', typeText: { at: 'prev', up: 1, match: '.item-content' } }
  },
  {
    key: 'chuanmei-exam',
    name: '传媒 考试（ShiTiYe）',
    match: [/\/Exam\/onlineTest\/ShiTiYe\.aspx/i],
    question: { root: '.ShiTi', stem: '.Paper_ParentQuestionDesc', options: '.Paper_Answer li', clickables: '.Paper_Answer input', typeText: { at: 'closest', within: '#ContentText', find: '#ExamFrameQuesDesc' } }
  },
  {
    key: 'hui-exam',
    name: '慧考试',
    match: [/\/examSystemPCInner\//i],
    question: { root: '.question-list-box > div', stem: '.topic-title', options: '.option_list', typeText: '.question-type-name' }
  },
  {
    key: 'zikao365-exam',
    name: '自考365 模拟考试',
    hosts: ['member.zikao365.com'],
    match: [[/member\.zikao365\.com/i, /generaltest\/exam\.shtm/i]],
    question: { root: '.timu', stem: '.timu-tit', options: '.timu-list .list', clickables: '.timu-list input' }
  },
  {
    key: 'moycp-exam',
    name: '幕享（moycp）在线学习',
    hosts: ['web.moycp.com'],
    match: [[/web\.moycp\.com/i, /\/study/i]],
    question: { root: '.question-list', stem: '.question-title', options: '.answer-option label', clickables: '.answer-option input', typeText: '.singleflag' },
    pager: { next: '.next-submit .next', timeoutMs: 6000 }
  },
  {
    key: 'maineng-exam',
    name: '麦能 LMS 在线考试',
    match: [/\/lms\/web\/onlineexam\/exambegin/i],
    question: { root: '.sdiv', stem: '.eptimu_name', options: '.ansdiv div', clickables: '.ansdiv input', typeText: '.eptimu_title' }
  },
  {
    key: 'tianshi-exam',
    name: '天使在线 测评 / 考试',
    match: [/\/pages_jsp\/mobile\/courseSimulate\.html/i, /\/pages_jsp\/mobile\/coursExamView\.html/i, /\/pages_jsp\/mobile\/courseAnswer\.html/i],
    question: { root: '.neixunExamQuestionHead', stem: '#title', options: '.option', typeText: '.tag' }
  },
  {
    key: 'jxyy-exam',
    name: '江西应用 考试作答',
    match: [/examinationAnswer/i],
    question: { root: '.answer-subject-details', stem: '.answer-subject', options: 'ul li p', clickables: 'ul li', typeText: '.answer-subject-top' }
  },
  {
    key: 'netdig-exam',
    name: '在线学习平台（edu.netdig.cn）试卷',
    hosts: ['edu.netdig.cn'],
    match: [[/edu\.netdig\.cn/i, /\/paper\.html/i]],
    question: { root: '.position-relative', stem: '.tmtitle-p', options: 'label .span-inline', clickables: 'label input', typeText: '.customtktype' }
  },
  {
    key: 'eduwest-exam',
    name: '含弘（zuoye.eduwest.com）考试记录',
    hosts: ['zuoye.eduwest.com'],
    match: [[/zuoye\.eduwest\.com/i, /\/examinationrecord/i]],
    question: { root: 'tr td table:has(a)', stem: 'td', options: 'a', clickables: 'input' }
  },
  {
    key: 'huashen-exam',
    name: '华莘学堂 考试',
    hosts: ['huashenxt.com'],
    match: [[/huashenxt\.com/i, /\/mgr\.html/i]],
    write: { target: 'label, input', selectedClass: ['selected'] },
    question: { root: '.question-item', stem: '.question_title .text', options: '.choice_item .text, .judge_item label', clickables: '.choice_item .choice_option, .judge_item input', typeText: '.question_type' }
  },
  {
    key: 'xljk-exam',
    name: '心理健康（zgxlwsxh）考试',
    hosts: ['zgxlwsxh.oxcoder.com.cn'],
    match: [/zgxlwsxh\.oxcoder\.com\.cn/i],
    question: { root: '.question-container', stem: '.question-box .ques-desc-content', options: '.question-box label', clickables: '.question-box label input', typeText: '.directory-title' },
    pager: { next: '.ant-btn-circle', timeoutMs: 6000 }
  },
  {
    key: 'xjtu-dlc-exam',
    name: '西安交通大学继续教育 考试',
    hosts: ['kj.xjtudlc.com'],
    match: [/kj\.xjtudlc\.com/i],
    write: { target: 'label, input', selectedClass: ['layui-checkcard-checked'] },
    question: { root: '.swiper-slide', stem: '.layui-space-item .question', options: '.layui-checkcard-desc', typeText: '.layui-space-item' }
  },
  {
    key: 'hebhjy-exam',
    name: '石家庄科技信息职业学院 考试',
    hosts: ['www.hebhjyc.cn'],
    match: [[/www\.hebhjyc\.cn/i, /exam/i]],
    question: { root: '.question-item', stem: '.question-header .q-title', options: '.options .opt-text', clickables: '.options .option-item', typeText: { at: 'closest', within: '.question-type-section', find: 'h3' } }
  },
  {
    key: 'bdjxjy-exam',
    name: '保定继续教育 答题页',
    match: [/\/exam\/answer\.html/i],
    question: { root: '.stem-container', stem: '.stem span', options: '.option div .optStem', clickables: '.option div input', typeText: { at: 'self', up: 2, find: '.description' } }
  },
  {
    key: 'afstudy-exam',
    name: 'noNi 自测（app-afstudy）',
    match: [/\/app-afstudy\/self_test\.html/i],
    question: { root: '.lineClass .b-papp-root', stem: '.b-exam-top .b-exam-tit', options: '.b-exam-box li label', clickables: '.b-exam-box li input', typeText: '.b-exam-top .b-exam-type' }
  },
  {
    key: 'ui-question-exam',
    name: '华侨 / 唐山继续教育 考试',
    match: [/\/exam\/student\/exam\//i],
    write: { target: 'label, input', selectedClass: ['ui-option-selected'] },
    question: { root: '.ui-question-group .ui-question', stem: '.ui-question-title div', options: '.ui-question-options div', clickables: '.ui-question-options .ui-question-options-order, .ui-question-content-wrapper, .ke-container', typeText: { at: 'parent', find: 'h2' } }
  },
  {
    key: 'fjjxjy-work',
    name: '福建继续教育 测验 / 作业',
    match: [/\/Web_Study\/Student\/Center\/MyWorkOnView/i, /\/Web_Study\/Student\/Center\/MyExamOnView/i],
    write: { target: 'label, input', selectedClass: ['correct'] },
    question: { root: '.topic-cont', stem: 'p', options: '.options li span', clickables: '.options li' }
  },
  {
    key: 'hnjxjy-exam',
    name: '湖南继续教育 考试',
    hosts: ['ls365.net','ls365.com','www.jwstudy.cn','hdjt.wuxuekeji.com','csjs.ynlhxy.com'],
    match: [[/ls365\.net|ls365\.com|www\.jwstudy\.cn|hdjt\.wuxuekeji\.com|csjs\.ynlhxy\.com/i, /\/User\/Student\/myhomework\.aspx/i], [/ls365\.net|ls365\.com|www\.jwstudy\.cn|hdjt\.wuxuekeji\.com|csjs\.ynlhxy\.com/i, /\/examing\.aspx/i]],
    write: { target: 'label, input', selectedClass: ['cur'] },
    question: { root: '.exam_question', stem: '.exam_question_title div', options: '.question_select .select_detail', clickables: '.question_select li', typeText: '.exam_question_title div strong' }
  },
  {
    key: 'deyang-exam',
    name: '德阳继续教育 考试',
    match: [/\/dypx\/OnlineExam\/Exam\.aspx/i],
    question: { root: '#divProblemArea', stem: '#ulProblems li:first', options: '#ulProblems .answer', clickables: '#ulProblems .answer input' }
  },
  {
    key: 'zibo-exam',
    name: '淄博继续教育 练习',
    match: [/\/practice\/start/i],
    write: { target: 'label, input', selectedClass: ['active'] },
    question: { root: '.header-left .trueorfalse .sub', stem: '.mb10', options: '.options li', typeText: { at: 'prev', up: 1 } }
  },
  {
    key: 'hebjxjy-exam',
    name: '河北继续教育 考试',
    match: [/paperid/i],
    write: { target: 'label, input', selectedClass: ['cur'] },
    question: { root: '.examItem', stem: '.examItemRight .question', options: '.examItemRight ul li span', clickables: '.examItemRight ul li',
      typeText: { at: 'parent', find: '.questTitle b' } }
  },
  {
    key: 'olex-exam',
    name: '保定继续教育（olex_exam 系）',
    match: [/\/cuggw\/rs\/olex_exam/i, /\/hebic\/rs\/olex_exam/i, /\/sjzkjxy\/rs\/olex_exam/i, /\/hbfsh\/rs\/olex_exam/i, /\/jxycu\/rs\/olex_exam/i, /\/jlufe\/rs\/olex_exam/i, /\/hbun\/rs\/olex_exam/i],
    question: { root: '.item_li', stem: '.item_title', options: 'ul li label', clickables: 'ul li input' }
  },
  {
    key: 'zygbxxpt-exam',
    name: '干部在线学习平台（zygbxxpt）考试',
    hosts: ['www.zygbxxpt.com'],
    match: [[/www\.zygbxxpt\.com/i, /\/exam/i]],
    question: { root: '.Body', stem: '.QName', options: '.QuestinXuanXiang p:not(:empty)', typeText: '.QName span' }
  },
  {
    key: 'pbaqks-exam',
    name: '平坝安监 pbaqks 在线学习测试',
    hosts: ['www.pbaqks.com'],
    match: [[/www\.pbaqks\.com/i, /\/P_ExamDetail\/OnlineStuday/i]],
    question: { root: '.main-container .single-box', stem: '.single-main:first', options: '.choose-box label', typeText: '.single-container .font-title' }
  },
  {
    key: 'dalian-exam',
    name: '大连 / 九江 在线学堂考试',
    match: [/\/onlineclass\/exam\//i],
    write: { target: 'label, input', selectedClass: ['ant-checkbox-checked'] },
    question: {
      root: '.single_excer_item___lFMCm, .single_excer_item___2lGB8',
      stem: '.title_content___1Qagx .title_content_text___27NIL, .title_content___24J6D .title_content_text___8ruL4',
      options: '.options_content___nXSwG label .option_text___udjiE, .options_content___2YgyG label .option_text___1mfcu',
      clickables: '.options_content___nXSwG label input, .options_content___2YgyG label input'
    }
  },
  {
    key: 'yxbyun-exam',
    name: '亿学宝云 考试 / 测验',
    hosts: ['yxbyun.com'],
    match: [[/yxbyun\.com/i, /\/exam/i], [/yxbyun\.com/i, /#\/testPaper/i]],
    write: { target: 'label, input', selectedClass: ['is-checked'] },
    question: {
      root: '.danxuan, .test',
      stem: '.tm, .type',
      options: '.xuanxiang .xxnr, .el-radio-group label, .el-checkbox-group label',
      clickables: '.xuanxiang .xxbh, .el-radio__input, .el-checkbox__input input',
      typeText: '.tx, .el-tag'
    },
    capture: [
      {
        source: 'jsonparse',
        marker: 'sjDtSaveReqVOS',
        shape: ['data.sjSjRespDto.sjDtSaveReqVOS'],
        list: 'data.sjSjRespDto.sjDtSaveReqVOS[]',
        children: 'sjSjstSaveReqVOS',
        fields: {
          question: 'tg',
          typeLabel: 'dtmc',
          options: { from: 'tkStxxSaveReqVOS', each: 'xxnr' },
          answer: [{ from: 'dxpdtda', split: ',' }, { from: 'dxtda', split: ',' }]
        }
      },
      {
        source: 'jsonparse',
        marker: 'bigContent',
        shape: ['data.bigContent'],
        list: 'data.bigContent[]',
        children: 'smallContent',
        fields: {
          question: ['question.questionTitle', 'content'],
          typeLabel: 'bigName',
          options: { from: 'question.optionList', each: 'questionContent' },
          answer: ['question.questionAnswer', 'answer']
        }
      }
    ]
  },
  {
    key: 'zhihuishu-smart-work',
    name: '智慧树 新形态课程 作业 / 掌握度',
    hosts: ['zhihuishu.com'],
    match: [[/zhihuishu\.com/i, /ReviewExam|studentReviewTestOrExam/i]],
    write: { target: 'label, .el-checkbox__input, .iconfont, input' },
    question: {
      root: '.questionContent',
      stem: '.questionName .centent-pre',
      options: '.radio-view li.clearfix, .checkbox-views label.el-checkbox',
      clickables: '.el-checkbox__input:not(.is-checked), i.iconfont:not(.checkedIcon)',
      blanks: '.fillAnswer'
    },
    pager: { next: '.next-topic.next-t', timeoutMs: 6000 }
  },
  {
    key: 'zhihuishu-fusion-exam',
    name: '智慧树 AI 助教 / 学伴 掌握度',
    hosts: ['zhihuishu.com'],
    match: [[/fusioncourseh5\.zhihuishu\.com|studywisdomh5\.zhihuishu\.com|wisdom-mooc\.zhihuishu\.com/i, /\/exam/i]],
    write: { target: 'label, .el-radio__input, .el-checkbox__input', selectedClass: ['is-checked'] },
    question: {
      root: '.exam-item',
      stem: '.quest-title .option-name',
      options: 'label',
      clickables: '.el-radio__input:not(.is-checked), .el-checkbox__input:not(.is-checked)',
      typeText: '.quest-type'
    }
  },
  {
    key: 'danwei-exam',
    name: '单位内部考试系统（vant 移动端）',
    hosts: ['61.183.163.9:8089', 'zjpt.nnjjtgs.com:8081'],
    match: [/ksnr|lxnr/i],
    write: { target: '.van-radio, .van-checkbox, label, input' },
    question: {
      root: '.tm',
      stem: '.tmnrbj span:last-child',
      options: '.van-radio-group .dxt .van-radio__label, .van-checkbox__label',
      clickables: '.van-radio__input, .van-checkbox__input',
      typeText: '.tmnrbj span',
      blanks: '.van-field__control'
    },
    capture: [{
      source: 'jsonparse',
      marker: 'topicList',
      shape: ['topicList'],
      list: 'topicList[]',
      fields: {
        question: 'ttop011',
        typeLabel: 'ttop010',
        options: { from: 'ttop018', split: '$$' },
        answer: ['ttop022', { from: 'ttop021', split: '$$' }]
      }
    }]
  },
  {
    key: 'ttcdw-exam',
    name: '新疆继续教育（ttcdw）考试',
    hosts: ['www.ttcdw.cn'],
    match: [[/www\.ttcdw\.cn/i, /\/p\/uExam\/goExam\//i]],
    write: { target: 'label, input', selectedClass: ['is-checked'] },
    question: {
      root: '.question-item',
      stem: '.question-item-title span',
      options: '.question-item-option label .el-checkbox__label, .el-radio__label',
      clickables: '.question-item-option label'
    },
    typeCodes: { 0: QuestionType.SINGLE, 1: QuestionType.MULTIPLE, 2: QuestionType.JUDGEMENT, 3: QuestionType.COMPLETION },
    capture: [{
      source: 'jsonparse',
      marker: 'assessList',
      shape: ['data.exam'],
      list: 'data.exam.assessList[].questionList[]',
      fields: {
        question: 'name',
        typeLabel: 'types',
        options: 'answers[].name',
        answer: { from: 'answers', each: 'name', where: ['isAnswer', '0'] }
      }
    }]
  },
  {
    key: 'hnzkw-test',
    name: '湖南造价（hnzkw）测验',
    hosts: ['hnzkw.org.cn'],
    match: [/hnzkw\.org\.cn/i],
    write: { target: '.el-radio, .el-checkbox, label, input', selectedClass: ['is-checked'] },
    question: {
      root: '.examList',
      stem: '.text',
      options: '.el-radio-group label, .el-checkbox-group label',
      clickables: '.el-radio-group input, .el-checkbox-group input',
      typeText: '.status'
    },
    typeCodes: { 0: QuestionType.SINGLE, 1: QuestionType.COMPLETION, 3: QuestionType.JUDGEMENT, 4: QuestionType.MULTIPLE },
    capture: [{
      source: 'jsonparse',
      marker: 'bookdatas',
      shape: ['data.bookdatas'],
      list: 'data.bookdatas[]',
      fields: {
        question: 'content',
        typeLabel: 'flag',
        options: [{ from: 'optionss' }, { from: 'selectOption' }],
        answer: 'answer'
      }
    }]
  },
  {
    key: 'yiban-exam',
    name: '易班 考试',
    hosts: ['exam.yooc.me'],
    match: [[/exam\.yooc\.me/i, /\/group/i]],
    question: { root: 'main:last', stem: 'h3 div', options: '.mb ul li .flex-auto', clickables: '.mb ul li', typeText: '.mb-s' }
  },
  {
    key: 'dianmo-exam',
    name: '点墨 考试',
    match: [/\/Exam\/StartExam/i],
    question: {
      root: '#question div div:first',
      stem: 'div:first',
      options: 'div:not(:first-child)',
      clickables: 'div:not(:first-child) input',
      typeText: { at: 'page', find: '.alert #groupNameSpan' }
    }
  },
  {
    key: 'ruixue-exam',
    name: '睿学 补考',
    hosts: ['ks.hustsnde.com'],
    match: [[/ks\.hustsnde\.com/i, /exam-app-exam-paper/i]],
    question: {
      root: '#paper .content-box',
      stem: 'ul li:first-child .desc',
      options: 'ul li:nth-child(2)',
      clickables: 'ul label input',
      typeText: '.title',
      optionsSplit: ['\\[[A-Z]:?\\]', '\\(?[A-Z.?]\\)?'],
      judgementOptions: ['正确', '错误']
    }
  },
  {
    key: 'tianze-exam',
    name: '石家庄理工职业学院 考试',
    hosts: ['edu.tianzerencai.com'],
    match: [[/edu\.tianzerencai\.com/i, /\/examinationDetail/i]],
    write: { target: 'label, input', selectedClass: ['cho-this'] },
    question: {
      root: '.topic',
      stem: '.title',
      options: '.main',
      clickables: '.main',
      typeText: '.title',
      optionsByType: {
        [QuestionType.SINGLE]: { options: '.radio .option_text', clickables: '.radio button' },
        [QuestionType.MULTIPLE]: { options: '.checkbox .option_text', clickables: '.checkbox button' },
        [QuestionType.JUDGEMENT]: { options: '.judge button', clickables: '.judge button', judgementOptions: ['正确', '错误'] }
      }
    }
  },
  {
    key: 'sinopec-exam',
    name: '中国石化网络学院 考试',
    hosts: ['sia.sinopec.com'],
    match: [[/sia\.sinopec\.com/i, /\/exam/i]],
    question: {
      root: ".queston-item>div:has([topisshow='0'])",
      stem: 'h6',
      options: '.el-radio,.el-checkbox label',
      clickables: '.el-radio,.el-checkbox input',
      indexFrom: 'a'
    },
    capture: {
      source: 'jsonparse',
      marker: 'partitions',
      shape: ['responseData.partitions'],
      list: 'responseData.partitions',
      listJson: 'partitions',
      children: 'questions',
      answerIndex: { base: 0 },
      fields: {
        question: 'stem',
        typeLabel: 'queTypeName',
        options: { from: 'options', each: 'optInfo' },
        answer: { from: 'answer', split: ',', map: { Y: '对', N: '错' } }
      }
    }
  }
].map((spec) => Object.assign({ write: { target: 'label, input' } }, spec));

const HOST_LABEL = '[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?';

const COMPLETE_HOST = new RegExp('^' + HOST_LABEL + '(?:\\.' + HOST_LABEL + ')+$', 'i');

const HOST_PLANS = new Map();

const HOST_CACHE = new Map();

// 平台分派表
export class PlatformRegistry {
  static specs = ([] as any[]).concat(SPECS, B1_SPECS, B2_SPECS, B3_SPECS);

  // 单条判定口径：能看出纯域名就整段比较，否则退回正则
  static hit(pattern, href, host) {
    let domains = HOST_PLANS.get(pattern);
    if (domains === undefined) {
      domains = null;
      const rendered = String(pattern.source == null ? '' : pattern.source).replace(/\\\//g, '/').replace(/\\\./g, '.');
      if (!rendered.includes('/') && !/[()[\]{}+*?]/.test(rendered)) {
        const list = rendered.replace(/^\^+|\$+|[\\^]/g, '').split('|')
          .map(part => part.trim().replace(/^\.+|\.+$/g, '').toLowerCase())
          .filter(Boolean);
        if (list.length && list.every((domain) => COMPLETE_HOST.test(domain))) domains = list;
      }
      if (HOST_PLANS.size > 400) HOST_PLANS.clear();
      HOST_PLANS.set(pattern, domains);
    }
    if (domains) return !!host && domains.some((domain) => host === domain || host.endsWith('.' + domain));
    try {
      return pattern.test(href);
    } catch (e) {
      return false;
    }
  }

  // match 语义
  static matches(spec, href) {
    const key = String(href == null ? '' : href);
    let host = HOST_CACHE.get(key);
    if (host === undefined) {
      host = '';
      try {
        host = String(new URL(key).hostname).toLowerCase();
      } catch (e) {}
      if (HOST_CACHE.size > 200) HOST_CACHE.clear();
      HOST_CACHE.set(key, host);
    }
    if ((spec.exclude || []).some((pattern) => PlatformRegistry.hit(pattern, href, host))) return false;
    return (spec.match || []).some((entry) => (Array.isArray(entry)
      ? entry.every((pattern) => PlatformRegistry.hit(pattern, href, host))
      : PlatformRegistry.hit(entry, href, host)));
  }

  // URL 优先
  static byHref(href) {
    return PlatformRegistry.specs.find((spec) => PlatformRegistry.matches(spec, href)) || null;
  }

  // 兜底要先对域名
  static byPresence(href, page) {
    let host = '';
    try {
      host = String(new URL(href).hostname).toLowerCase();
    } catch (e) {}
    if (!host || !page || !page.querySelectorAll) return null;
    return PlatformRegistry.specs
      .find((spec) => spec.presence !== false && (spec.hosts || []).some((domain) => {
        const name = String(domain).toLowerCase();
        return host === name || host.endsWith('.' + name) || (name.includes('.') && !COMPLETE_HOST.test(name) && host.startsWith(name + '.'));
      }) && FrameProbe.queryAll((spec.question || {}).root, page).length > 0) || null;
  }

  // 判平台
  static detect(href, page) {
    const url = href == null ? (HAS_DOM ? location.href : '') : href;
    const view = page || (HAS_DOM ? document : null);
    return PlatformRegistry.byHref(url) || PlatformRegistry.byPresence(url, view);
  }

  // 登记 spec
  static register(spec) {
    if (!spec || !spec.key) throw new Error('spec.key 必填');
    const at = PlatformRegistry.specs.findIndex((item) => item.key === spec.key);
    if (at >= 0) PlatformRegistry.specs.splice(at, 1, spec);
    else PlatformRegistry.specs.push(spec);
    return spec;
  }
}

export const JsonWatch = {
  limit: 24,
  payloads: [],
  subs: [],
  keys: null,
  restore: null,
  installs: 0,
  subscribe(capture) {
    if (this.subs.indexOf(capture) < 0) this.subs.push(capture);
    capture.cursor = this.length();
  },
  unsubscribe(capture) {
    const at = this.subs.indexOf(capture);
    if (at >= 0) this.subs.splice(at, 1);
  },
  install(win) {
    this.installs += 1;
    if (this.restore || !win || !win.JSON) return !!this.restore;
    const raw = win.JSON.parse;
    const self = this;
    win.JSON.parse = function (...args) {
      const result = raw.apply(this, args);
      try {
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          if (!self.keys) {
            const set = new Set();
            for (const spec of PlatformRegistry.specs) {
              const list = spec.capture ? (Array.isArray(spec.capture) ? spec.capture : [spec.capture]) : [];
              for (const entry of list) {
                for (const shape of entry.shape || []) set.add(String(shape).split('.')[0]);
              }
            }
            self.keys = set;
          }
          if (Object.keys(result).some((key) => self.keys.has(key))) {
            self.payloads.push(result);
            if (self.payloads.length > self.limit) self.payloads.shift();
            for (const capture of self.subs.slice()) {
              try {
                capture.ingest(result);
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
      return result;
    };
    this.restore = () => {
      win.JSON.parse = raw;
      this.payloads = [];
    };
    return true;
  },
  release() {
    this.installs = Math.max(0, this.installs - 1);
    if (!this.installs && this.restore) {
      this.restore();
      this.restore = null;
    }
  },
  length() { return this.payloads.length; },
  since(cursor) { return this.payloads.slice(cursor || 0); }
};
