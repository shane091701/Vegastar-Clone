class CreateDataAudits < ActiveRecord::Migration[8.0]
  def change
    create_table :data_audits do |t|
      t.string :entity_type, null: false
      t.bigint :record_id
      t.string :entity_label
      t.string :action, null: false
      t.text :detail
      t.string :actor_email
      t.timestamps
    end
    add_index :data_audits, [:entity_type, :record_id]
    add_index :data_audits, :created_at
  end
end
