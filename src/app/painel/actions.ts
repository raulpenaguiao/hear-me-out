"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import {
  channelInputSchema,
  episodeInputSchema,
  episodeStatusSchema,
  firstIssueMessage,
  passwordSchema,
  profileSchema,
  rotateTokensSchema,
  uuidSchema,
} from "@/lib/validation";
import { requirePublisher } from "@/server/auth";
import { createChannel, deleteChannel, rotateChannelTokens, updateChannel } from "@/server/services/channels";
import { deleteEpisode, setEpisodeStatus, updateEpisode } from "@/server/services/episodes";
import { ServiceError } from "@/server/services/errors";

function errorState(error: unknown): FormState {
  if (error instanceof ServiceError) return { error: error.message };
  console.error("server action error", error instanceof Error ? error.message : "unknown");
  return { error: "Ocorreu um erro inesperado. Tenta novamente." };
}

function channelFromForm(formData: FormData) {
  return channelInputSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    authorName: formData.get("authorName") ?? "",
    category: formData.get("category") ?? undefined,
    explicit: formData.get("explicit") === "on",
    // Checkboxes are absent when unchecked; the edit form sends a marker field.
    published: formData.has("hasPublishedField") ? formData.get("published") === "on" : true,
  });
}

export async function createChannelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requirePublisher();
  const parsed = channelFromForm(formData);
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };
  let id: string;
  try {
    ({ id } = await createChannel(ctx, { ...parsed.data, published: true }));
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/painel", "layout");
  redirect(`/painel/canais/${id}?novo=1`);
}

export async function updateChannelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requirePublisher();
  const id = uuidSchema.safeParse(formData.get("channelId"));
  const parsed = channelFromForm(formData);
  if (!id.success) return { error: "Canal inválido." };
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };
  try {
    await updateChannel(ctx, id.data, parsed.data);
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/painel", "layout");
  redirect(`/painel/canais/${id.data}?guardado=1`);
}

export async function rotateTokensAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requirePublisher();
  const id = uuidSchema.safeParse(formData.get("channelId"));
  const which = rotateTokensSchema.safeParse({ which: formData.get("which") });
  if (!id.success || !which.success) return { error: "Pedido inválido." };
  try {
    await rotateChannelTokens(ctx, id.data, which.data.which);
  } catch (error) {
    return errorState(error);
  }
  revalidatePath(`/painel/canais/${id.data}`);
  return {
    success:
      which.data.which === "rss"
        ? "Novo link RSS gerado. O link antigo deixou de funcionar."
        : which.data.which === "web"
          ? "Novo link da página gerado. O link antigo deixou de funcionar."
          : "Novos links gerados. Os links antigos deixaram de funcionar.",
  };
}

export async function deleteChannelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requirePublisher();
  const id = uuidSchema.safeParse(formData.get("channelId"));
  if (!id.success) return { error: "Canal inválido." };
  try {
    await deleteChannel(ctx, id.data);
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/painel", "layout");
  redirect("/painel/canais?apagado=1");
}

export async function updateEpisodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requirePublisher();
  const id = uuidSchema.safeParse(formData.get("episodeId"));
  const parsed = episodeInputSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
  });
  if (!id.success) return { error: "Episódio inválido." };
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };
  try {
    await updateEpisode(ctx, id.data, parsed.data);
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/painel", "layout");
  return { success: "Alterações guardadas." };
}

export async function setEpisodeStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requirePublisher();
  const id = uuidSchema.safeParse(formData.get("episodeId"));
  const status = episodeStatusSchema.safeParse(formData.get("status"));
  if (!id.success || !status.success) return { error: "Pedido inválido." };
  try {
    await setEpisodeStatus(ctx, id.data, status.data);
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/painel", "layout");
  return {
    success:
      status.data === "published"
        ? "Episódio publicado. Já aparece no feed e na página do canal."
        : "Episódio despublicado. Deixou de estar disponível para quem ouve.",
  };
}

export async function deleteEpisodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requirePublisher();
  const id = uuidSchema.safeParse(formData.get("episodeId"));
  if (!id.success) return { error: "Episódio inválido." };
  let channelId: string;
  try {
    ({ channelId } = await deleteEpisode(ctx, id.data));
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/painel", "layout");
  redirect(`/painel/canais/${channelId}?episodio-apagado=1`);
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx, user } = await requirePublisher();
  const parsed = profileSchema.safeParse({ displayName: formData.get("displayName") ?? "" });
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };
  const { error } = await ctx.db
    .from("profiles")
    .update({ display_name: parsed.data.displayName || null })
    .eq("id", user.id);
  if (error) return { error: "Não foi possível guardar. Tenta novamente." };
  revalidatePath("/painel", "layout");
  return { success: "Perfil atualizado." };
}

export async function updatePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ctx } = await requirePublisher();
  const password = passwordSchema.safeParse(formData.get("password"));
  if (!password.success) return { error: firstIssueMessage(password.error) };
  if (formData.get("password") !== formData.get("confirm")) {
    return { error: "As palavras-passe não coincidem." };
  }
  const { error } = await ctx.db.auth.updateUser({ password: password.data });
  if (error) {
    if (error.code === "same_password") return { error: "Escolhe uma palavra-passe diferente da atual." };
    if (error.code === "weak_password") return { error: "A palavra-passe é demasiado fraca." };
    return { error: "Não foi possível alterar a palavra-passe. Tenta novamente." };
  }
  return { success: "Palavra-passe alterada." };
}
