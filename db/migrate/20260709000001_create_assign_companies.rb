class CreateAssignCompanies < ActiveRecord::Migration[8.0]
  def change
    create_table :assign_companies do |t|
      t.string :name, null: false
      t.timestamps
    end
    add_index :assign_companies, :name, unique: true
  end
end
