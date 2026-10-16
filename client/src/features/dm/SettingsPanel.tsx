import { useState } from 'react';
import { BookMarked, Download, Dices, KeyRound, Keyboard, Shield, Sparkles } from 'lucide-react';
import { setDmPassword } from '../../net/api.ts';
import { getPref, setPref } from '../../net/session.ts';
import { act } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { useIsDM } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { Button, Field, Segmented, Toggle, toast } from '../../ui/index.tsx';
import './dm.css';

const SHORTCUTS: [string, string][] = [
  ['V', 'Selecionar/mover'], ['M', 'Régua'], ['P', 'Ping'], ['D', 'Desenhar'], ['A', 'Área de efeito'],
  ['T', 'Marcar alvo (token sob o mouse)'], ['Alt + clique', 'Ping rápido'], ['Espaço + arrastar', 'Mover a câmera'],
  ['Botão do meio/direito', 'Mover a câmera'], ['Roda', 'Zoom'], ['Setas', 'Mover token selecionado'],
  ['Shift + clique', 'Rolar com vantagem'], ['Ctrl + clique', 'Rolar com desvantagem'], ['Enter ou /', 'Abrir o chat'],
  ['Tab', 'Abrir/fechar painel'], ['C', 'Ficha'], ['I', 'Combate'], ['Duplo clique no token', 'Abrir ficha'],
  ['W / L / F / N', 'Paredes / Luzes / Névoa / Notas (Mestre)'], ['Delete', 'Remover tokens selecionados (Mestre)'],
];

export default function SettingsPanel() {
  const isDM = useIsDM();
  const settings = useGame((s) => s.state?.settings);
  const name = useGame((s) => s.state?.name ?? '');
  const customSystem = useGame((s) => s.state?.customSystem ?? null);
  const [dice3d, setDice3d] = useState(() => getPref('dice3d', true));
  const [campaignName, setCampaignName] = useState(name);
  const [pw, setPw] = useState('');
  if (!settings) return null;
  const set = (patch: Parameters<typeof act<'settings.update'>>[1]) => act('settings.update', patch);

  return (
    <div className="dm-panel u-scroll">
      <div className="section-title"><Dices size={13} /> Pessoal</div>
      <div className="u-col u-gap-3">
        <Toggle checked={dice3d} onChange={(v) => { setDice3d(v); setPref('dice3d', v); }} label="Animação de dados 3D" />
      </div>

      {isDM && (
        <>
          <div className="section-title u-mt-3"><Shield size={13} /> Regras da mesa</div>
          <div className="u-col u-gap-3">
            <Toggle checked={settings.wallsBlockMovement} onChange={(v) => set({ wallsBlockMovement: v })} label="Paredes bloqueiam o movimento dos jogadores" />
            <Toggle checked={settings.hpStatusForPlayers} onChange={(v) => set({ hpStatusForPlayers: v })} label="Jogadores veem o estado dos inimigos (Ferido, Muito ferido…)" />
            <Toggle checked={settings.autoRollNpcInitiative} onChange={(v) => set({ autoRollNpcInitiative: v })} label="Rolar iniciativa dos NPCs automaticamente" />
            <Toggle checked={settings.playerDrawing} onChange={(v) => set({ playerDrawing: v })} label="Jogadores podem desenhar no mapa" />
            <Toggle checked={settings.playerTemplates} onChange={(v) => set({ playerTemplates: v })} label="Jogadores podem criar áreas de efeito" />
            <Toggle checked={settings.dice3d} onChange={(v) => set({ dice3d: v })} label="Dados 3D para todos" />
          </div>

          <div className="section-title u-mt-3"><BookMarked size={13} /> Sistema de regras</div>
          <div className="u-col u-gap-3">
            <Segmented
              value={settings.system}
              options={[
                { value: 'dnd5e', label: 'D&D 5e', icon: <Shield /> },
                { value: 'custom', label: customSystem ? customSystem.name.slice(0, 24) : 'Sistema customizado', icon: <BookMarked /> },
              ]}
              onChange={(v) => {
                if (v === 'custom' && !customSystem) useUi.getState().openSidebar('system');
                else set({ system: v });
              }}
            />
            <span className="u-xs u-muted">
              {customSystem
                ? 'As fichas seguem o sistema escolhido. O sistema importado fica guardado mesmo usando D&D 5e.'
                : 'Importe as regras do seu próprio RPG (PDF, DOCX ou texto) e a IA monta fichas para ele.'}
            </span>
            <Button icon={<BookMarked />} onClick={() => useUi.getState().openSidebar('system')}>
              {customSystem ? 'Abrir sistema customizado' : 'Importar sistema customizado'}
            </Button>
          </div>

          <div className="section-title u-mt-3"><Sparkles size={13} /> Campanha</div>
          <div className="u-col u-gap-3">
            <Field label="Nome">
              <input className="input" value={campaignName} maxLength={80} onChange={(e) => setCampaignName(e.target.value)} onBlur={() => {
                if (campaignName.trim() && campaignName !== name) void act('campaign.rename', { name: campaignName.trim() });
              }} />
            </Field>
            <Field label={<><KeyRound size={12} style={{ verticalAlign: -1 }} /> Senha do Mestre</>} hint="Permite entrar como Mestre em outro dispositivo. Deixe vazio e salve para remover.">
              <div className="u-row">
                <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="nova senha" autoComplete="new-password" />
                <Button onClick={async () => {
                  const ok = await setDmPassword(pw.trim() || null);
                  toast(ok ? (pw.trim() ? 'Senha definida.' : 'Senha removida.') : 'Não foi possível salvar.', ok ? 'success' : 'danger');
                  setPw('');
                }}>Salvar</Button>
              </div>
            </Field>
            <Button icon={<Download />} onClick={() => {
              const st = useGame.getState().state;
              if (!st) return;
              const blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `${st.name.replace(/[^\w\s-]/g, '').trim() || 'campanha'}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }}>Exportar campanha (JSON)</Button>
          </div>
        </>
      )}

      <div className="section-title u-mt-3"><Keyboard size={13} /> Atalhos</div>
      <div className="shortcuts">
        {SHORTCUTS.map(([k, d]) => (
          <div key={k} className="shortcuts__row"><span className="kbd">{k}</span><span className="u-sm u-muted">{d}</span></div>
        ))}
      </div>
    </div>
  );
}
