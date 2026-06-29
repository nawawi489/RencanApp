-- 0028 — Defense-in-depth: gate `evidence_description` saat aktivasi Action Plan.
--
-- PRD §22.5 "Bukti yang diminta" wajib. Semantik: bila evidence_required=true (toggle "Wajib
-- lampirkan Bukti"), deskripsi bukti WAJIB diisi — agar PIC tahu bukti apa yang diharapkan.
-- Bila evidence_required=false (tidak wajib bukti), evidence_description boleh kosong.
--
-- Re-define activate_action_plan (versi terakhir = 0026) dengan penambahan satu predikat baru
-- pada kelengkapan di kedua cabang (one-time & repeat).

create or replace function public.activate_action_plan(p_action_plan_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.action_plans;
  rule public.action_plan_repeat_rules;
  v_count int;
begin
  select * into a from public.action_plans where id = p_action_plan_id;
  if not found then raise exception 'Action Plan tidak ditemukan.'; end if;
  if not (a.created_by = auth.uid() or public.has_permission('manage_others_cards')
          or exists (select 1 from public.initiatives i where i.id = a.initiative_id and i.pic_id = auth.uid())) then
    raise exception 'Anda tidak berwenang mengaktifkan Action Plan ini.';
  end if;
  if a.status <> 'draft' then raise exception 'Action Plan sudah diaktifkan.'; end if;
  if a.pic_id = a.reviewer_id then
    raise exception 'PIC dan Reviewer tidak boleh orang yang sama.';
  end if;

  -- Cabang REPEAT
  if a.repeat_setting = 'repeat' then
    select * into rule from public.action_plan_repeat_rules where action_plan_id = p_action_plan_id;
    if not found then raise exception 'Repeat Rule belum diatur untuk Action Plan ini.'; end if;
    if coalesce(trim(a.name), '') = '' or a.pic_id is null or a.reviewer_id is null
       or coalesce(trim(a.expected_output), '') = '' or coalesce(trim(a.definition_of_done), '') = ''
       or a.priority is null
       or coalesce(trim(a.deadline_time), '') = '' then
      raise exception 'Kelengkapan Action Plan belum terpenuhi (nama, PIC, Reviewer, output, definition of done, prioritas, Jam Deadline wajib).';
    end if;
    if a.evidence_required and coalesce(trim(a.evidence_description), '') = '' then
      raise exception 'Bukti yang Diminta wajib dideskripsikan saat Bukti diwajibkan (PRD §22.5).';
    end if;
    update public.action_plans set status = 'in_progress' where id = p_action_plan_id;
    v_count := public.generate_action_plan_instances(p_action_plan_id, rule.repeat_end_date);
    perform public.write_activity('action_plan', p_action_plan_id, 'activate_repeat',
      jsonb_build_object('pic_id', a.pic_id, 'reviewer_id', a.reviewer_id, 'instances', v_count));
    return;
  end if;

  -- Cabang ONE TIME
  if coalesce(trim(a.name), '') = '' or a.pic_id is null or a.reviewer_id is null
     or a.start_date is null or a.deadline is null
     or coalesce(trim(a.expected_output), '') = '' or coalesce(trim(a.definition_of_done), '') = ''
     or a.priority is null
     or coalesce(trim(a.deadline_time), '') = '' then
    raise exception 'Kelengkapan Action Plan belum terpenuhi (nama, PIC, Reviewer, tanggal mulai, deadline, Jam Deadline, output, definition of done, prioritas wajib).';
  end if;
  if a.evidence_required and coalesce(trim(a.evidence_description), '') = '' then
    raise exception 'Bukti yang Diminta wajib dideskripsikan saat Bukti diwajibkan (PRD §22.5).';
  end if;
  update public.action_plans set status = 'assigned' where id = p_action_plan_id;
  perform public.write_activity('action_plan', p_action_plan_id, 'activate',
    jsonb_build_object('pic_id', a.pic_id, 'reviewer_id', a.reviewer_id));
end;
$$;
