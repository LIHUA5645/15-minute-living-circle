// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，07
// 语音识别（说一句 → 转文字）：小程序录音后把**原始音频字节**发到这里，
// 由服务端代持密钥调百度短语音识别，再把文字回给小程序。
// 为什么不让小程序直连：语音识别的 AK/SK 是「服务端密钥」，绝不能进小程序包（会被反编译拿走）；
// 这条与 AI 密钥走 /airelay 中转是同一个原则。
//
// 配置：.env 里的 BAIDU_YUYIN_AK / BAIDU_YUYIN_SK
//   —— 注意这是百度智能云「语音技术」应用的密钥，与地图 AK 是两套东西，要单独开通（有免费额度）。
// 音频约定：PCM / 16kHz / 单声道（小程序端就按这个录，百度短语音识别的默认入参）
const TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token';
const ASR_URL = 'https://vop.baidu.com/server_api';

// access_token 有效期 30 天：缓存起来，别每句话都换一次
let huanCun = { token: '', daoQi: 0 };

export function chuangJianYuYin({ ak, sk }) {
  const peiHao = () => !!(ak && sk);

  async function quToken() {
    if (huanCun.token && Date.now() < huanCun.daoQi) return huanCun.token;
    const u = `${TOKEN_URL}?grant_type=client_credentials&client_id=${encodeURIComponent(ak)}&client_secret=${encodeURIComponent(sk)}`;
    const r = await fetch(u);
    const j = await r.json();
    if (!j.access_token) throw new Error(j.error_description || j.error || '百度返回里没有 access_token（多半是 AK/SK 填错）');
    // 提前 10 分钟过期，避免边界上用到刚失效的 token
    huanCun = { token: j.access_token, daoQi: Date.now() + (Number(j.expires_in || 2592000) - 600) * 1000 };
    return j.access_token;
  }

  // 收请求体：小程序把音频读成 base64 用普通 request 发 JSON——
  // uploadFile 只能发 multipart，那还得服务端手写 multipart 解析，不如 base64 直接
  function duJson(req, zuiDa = 4 * 1024 * 1024) {
    return new Promise((jie, ju) => {
      const kuai = [];
      let he = 0;
      req.on('data', c => {
        he += c.length;
        if (he > zuiDa) {
          ju(new Error('音频过大（上限约 30 秒）'));
          req.destroy();
          return;
        }
        kuai.push(c);
      });
      req.on('end', () => {
        try {
          jie(JSON.parse(Buffer.concat(kuai).toString('utf-8') || '{}'));
        } catch {
          ju(new Error('请求体不是合法 JSON'));
        }
      });
      req.on('error', ju);
    });
  }

  return async function yuYinZhongJi(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!peiHao()) {
      return res.end(
        JSON.stringify({
          ok: false,
          xinxi:
            '服务端未配置语音识别密钥：请在 .env 里填 BAIDU_YUYIN_AK / BAIDU_YUYIN_SK' +
            '（百度智能云「语音技术」应用，与地图 AK 不是同一套），保存后重启服务端即可'
        })
      );
    }
    try {
      const { yin: b64 } = await duJson(req);
      const yin = Buffer.from(String(b64 || ''), 'base64');
      if (!yin.length) return res.end(JSON.stringify({ ok: false, xinxi: '没有收到音频数据' }));
      const token = await quToken();
      const r = await fetch(`${ASR_URL}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          format: 'pcm',
          rate: 16000,
          channel: 1,
          cuid: 'shenghuoquan-xcx',
          token,
          speech: yin.toString('base64'),
          len: yin.length
        })
      });
      const j = await r.json();
      if (j.err_no !== 0) {
        return res.end(JSON.stringify({ ok: false, xinxi: `百度语音识别失败（${j.err_no}）：${j.err_msg || ''}` }));
      }
      return res.end(JSON.stringify({ ok: true, wen: (j.result || []).join('').trim() }));
    } catch (e) {
      return res.end(JSON.stringify({ ok: false, xinxi: '语音识别异常：' + ((e && e.message) || '') }));
    }
  };
}
