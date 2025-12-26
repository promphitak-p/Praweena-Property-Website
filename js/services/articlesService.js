import { supabase } from '../utils/supabaseClient.js';

export async function getArticles() {
    const { data, error } = await supabase
        .from('articles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function getPublishedArticles(limit = 3) {
    const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

export async function getArticleById(id) {
    const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

export async function createArticle(article) {
    const { data, error } = await supabase
        .from('articles')
        .insert([article])
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function updateArticle(id, updates) {
    const { data, error } = await supabase
        .from('articles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteArticle(id) {
    const { error } = await supabase
        .from('articles')
        .delete()
        .eq('id', id);

    if (error) throw error;
    return true;
}

export async function uploadArticleImage(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from('article-images')
        .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
        .from('article-images')
        .getPublicUrl(filePath);

    return publicUrl;
}
