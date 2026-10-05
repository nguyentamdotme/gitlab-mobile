import React, { useState } from "react";
import { router } from "expo-router";
import { FolderGit2, Search } from "lucide-react-native";
import { PagedList, Field, ListRow, Button } from "../../components/ui";
import { api } from "../../core/query/provider";
export default function Projects() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  return (
    <PagedList
      title="Projects"
      queryKey={["projects", filter]}
      load={(page, signal) => api.projects({ page, search: filter }, signal)}
      header={
        <>
          <Field
            label="Tìm project"
            value={search}
            onChange={setSearch}
            placeholder="Tên hoặc namespace project"
          />
          <Button
            title="Tìm kiếm"
            icon={Search}
            onPress={() => setFilter(search.trim())}
          />
        </>
      }
      renderItem={(project) => (
        <ListRow
          title={project.name}
          subtitle={project.path_with_namespace}
          icon={FolderGit2}
          onPress={() => router.push(`/projects/${project.id}`)}
        />
      )}
    />
  );
}
