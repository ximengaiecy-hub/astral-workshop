export default function CupRules() {
  return (
    <div className="cup-rules" id="rules">
      <section className="cup-section cup-about-section" aria-labelledby="cup-about-title">
        <div className="cup-heading">
          <div className="cup-section-headline"><span className="cup-section-number" aria-hidden="true">01</span><div><p className="cup-eyebrow">THE INVITATION</p><h2 id="cup-about-title">让第一笔，也能成为参赛作品</h2></div></div>
          <p>友善交流 · 一起降低涂装入坑门槛</p>
        </div>
        <p className="cup-intro">不论你刚拿起画笔，还是已经积累了自己的涂装经验，都欢迎在这里分享作品、交流技巧。老手可以参与指导与答疑，新人也能安心完成自己的第一件参赛作品。</p>
        <div className="cup-rule-grid">
          <article className="cup-rule-card">
            <p className="cup-eyebrow">01 / BEGINNER</p><h3>新手组</h3>
            <p className="cup-fee"><strong>15.9</strong><span>元 / 人</span></p>
            <ul className="cup-kit"><li>1 只已处理矮人</li><li>包邮寄送到家</li></ul>
            <p>欢迎刚开始接触棋子涂装的朋友参加。</p>
          </article>
          <article className="cup-rule-card">
            <p className="cup-eyebrow">02 / EXPERIENCED</p><h3>老手组</h3>
            <p className="cup-fee"><strong>19.9</strong><span>元 / 人</span></p>
            <ul className="cup-kit"><li>2 只未处理矮人</li><li>由主办方寄送</li></ul>
            <p>分享你的涂装经验，也为新人提供指导与答疑。</p>
          </article>
          <article className="cup-rule-card cup-organizers">
            <p className="cup-eyebrow">TOGETHER</p><h3>一起把热爱传下去</h3>
            <dl><div><dt>主办</dt><dd>星界研究所 TRPG</dd></div><div><dt>赞助</dt><dd>希梦魔法屋</dd></div></dl>
            <p>参赛棋子由主办方寄送；新手组包邮到家。</p>
            <p className="cup-contact">TRPG 涂装交流群 · 示例渠道</p>
            <p className="cup-contact">星界杯赛事消息群 · 示例渠道</p>
          </article>
        </div>
      </section>

      <section className="cup-section cup-schedule-section" aria-labelledby="cup-timeline-title">
        <div className="cup-heading">
          <div className="cup-section-headline"><span className="cup-section-number" aria-hidden="true">02</span><div><p className="cup-eyebrow">THE JOURNEY</p><h2 id="cup-timeline-title">从第一笔，到被看见</h2></div></div>
          <p>具体日期由主办方另行发布</p>
        </div>
        <ol className="cup-timeline">
          <li><span className="cup-step">01</span><h3>未开始</h3><strong>等待开启</strong><p>了解规则，等待主办方开放报名。</p></li>
          <li><span className="cup-step">02</span><h3>报名阶段</h3><strong>7 天</strong><p>截至到10月26日，选择组别，完成报名</p></li>
          <li><span className="cup-step">03</span><h3>涂装创作</h3><strong>15 天</strong><p>统一邮寄到位后15天开始计时，完成作品涂装。</p></li>
          <li><span className="cup-step">04</span><h3>投稿阶段</h3><strong>时间待公布</strong><p>登录后上传作品，至少包含一张正面图。</p></li>
          <li><span className="cup-step">05</span><h3>公开投票阶段</h3><strong>时间待公布</strong><p>登录后，为喜欢的作品投票。</p></li>
          <li><span className="cup-step">06</span><h3>本届已结束</h3><strong>赛事结束</strong><p>揭晓各组获奖名单，保留作品展示。</p></li>
        </ol>
      </section>

      <section className="cup-section" aria-labelledby="cup-prizes-title">
        <div className="cup-heading">
          <div className="cup-section-headline"><span className="cup-section-number" aria-hidden="true">03</span><div><p className="cup-eyebrow">PRIZES & REWARDS</p><h2 id="cup-prizes-title">给每一份投入，一份回响</h2></div></div>
          <p>TRPG 模型奖品与店铺优惠券</p>
        </div>
        <div className="cup-prize-grid">
          <article className="cup-prize-card" data-division="experienced">
            <div className="cup-prize-heading" data-mark="E"><span>EXPERIENCED</span><h3>老手组奖项</h3></div>
            <div className="cup-table-wrap">
              <table className="cup-prize-table">
                <caption className="sr-only">老手组奖项、名额及奖励</caption>
                <thead><tr><th scope="col">奖项 / 名额</th><th scope="col">模型奖励</th><th scope="col">店铺券</th></tr></thead>
                <tbody>
                  <tr><th scope="row"><span className="cup-medal cup-gold">金奖</span><small>1 名</small></th><td>超大型棋子：提亚马特 / 巴哈姆特（自选其一）<br /><span className="cup-muted">或：大型龙类 ×1 + 矮人 ×10</span></td><td>8 折<small>5 次</small></td></tr>
                  <tr><th scope="row"><span className="cup-medal cup-silver">银奖</span><small>1 名</small></th><td>大型龙类 ×1 + 矮人 ×6</td><td>8 折<small>5 次</small></td></tr>
                  <tr><th scope="row"><span className="cup-medal cup-bronze">铜奖</span><small>1 名</small></th><td>大型龙类 ×1 + 矮人 ×4</td><td>8 折<small>3 次</small></td></tr>
                </tbody>
              </table>
            </div>
            <p className="cup-participation">参与奖 <strong>店铺 9 折券 · 3 次</strong></p>
          </article>
          <article className="cup-prize-card" data-division="beginner">
            <div className="cup-prize-heading" data-mark="B"><span>BEGINNER</span><h3>新手组奖项</h3></div>
            <div className="cup-table-wrap">
              <table className="cup-prize-table">
                <caption className="sr-only">新手组奖项、名额及奖励</caption>
                <thead><tr><th scope="col">奖项 / 名额</th><th scope="col">模型奖励</th><th scope="col">店铺券</th></tr></thead>
                <tbody>
                  <tr><th scope="row"><span className="cup-medal cup-gold">一等奖</span><small>1 名</small></th><td>矮人与龙组合包<small>青年龙 ×1（自选）+ 矮人 ×6</small></td><td>8 折<small>5 次</small></td></tr>
                  <tr><th scope="row"><span className="cup-medal cup-silver">二等奖</span><small>2 名</small></th><td>矮人与眼魔组合包<small>眼魔 ×1 + 矮人 ×5</small></td><td>8 折<small>3 次</small></td></tr>
                  <tr><th scope="row"><span className="cup-medal cup-bronze">三等奖</span><small>3 名</small></th><td>矮人与熊组合包<small>枭熊 ×1 + 矮人 ×4</small></td><td>8 折<small>1 次</small></td></tr>
                </tbody>
              </table>
            </div>
            <p className="cup-participation">参与奖 <strong>店铺 9 折券 · 3 次</strong></p>
          </article>
        </div>
        <p className="cup-prize-substitution">奖品中的矮人可替换为地精、狗头人、骷髅、丧尸、卓尔精灵、雏龙中的任一种类。</p>
      </section>

      <section className="cup-section cup-ballot-section" aria-labelledby="cup-voting-rules-title">
        <div className="cup-heading">
          <div className="cup-section-headline"><span className="cup-section-number" aria-hidden="true">04</span><div><p className="cup-eyebrow">A FRIENDLY COMPETITION</p><h2 id="cup-voting-rules-title">把票投给打动你的作品</h2></div></div>
        </div>
        <div className="cup-rule-notes">
          <div className="cup-ballot-lead" aria-hidden="true"><strong>5<span>票 / 组</span></strong><p>每一个账号<br />都能让热爱被看见。</p></div>
          <div><h3>投票规则</h3><ul><li>登录后才能投票。</li><li>每个账号在新手组、老手组各有 5 票。</li><li>同一作者在同一组最多获得你的 1 票。</li><li>可以只投出部分票数，未用完也可结束投票。</li></ul></div>
          <div><h3>友善交流，共同进步</h3><p>欣赏不同的涂装风格，尊重每位参赛者的投入。欢迎老手分享经验、帮助新人答疑，让交流也成为这场活动的一部分。</p><p className="cup-contact">活动咨询 · 主办微信 <strong>示例联系渠道</strong></p></div>
        </div>
      </section>
    </div>
  );
}
